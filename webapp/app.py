import os
import pickle
import io
import csv
import json
import numpy as np
import pandas as pd
from flask import Flask, request, jsonify, send_from_directory, send_file
from flask_cors import CORS
from rdkit import Chem
from rdkit.Chem import MACCSkeys, Descriptors, rdMolDescriptors
from rdkit.Chem import Draw
from rdkit import RDLogger

RDLogger.DisableLog('rdApp.*')

app = Flask(__name__, static_folder='static')
CORS(app)

# --- Load Model ---
MODEL_PATH = os.path.join(os.path.dirname(__file__), '..', 'qsar_model_xgboost_(maccs).pkl')
model = None

def load_model():
    global model
    try:
        with open(MODEL_PATH, 'rb') as f:
            data = pickle.load(f)
        if isinstance(data, dict) and 'model' in data:
            model = data['model']
        else:
            model = data
        print(f"[OK] Model loaded: {type(model)}")
    except Exception as e:
        print(f"[ERROR] Could not load model: {e}")

load_model()


def smiles_to_maccs(smiles):
    """Convert a SMILES string to a MACCS fingerprint bit vector."""
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return None
    fp = MACCSkeys.GenMACCSKeys(mol)
    return np.array(list(map(int, list(fp.ToBitString()))))


def get_mol_properties(smiles):
    """Get basic molecular properties for display."""
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return {}
    return {
        "mw": round(Descriptors.MolWt(mol), 2),
        "logp": round(Descriptors.MolLogP(mol), 2),
        "hba": rdMolDescriptors.CalcNumHBA(mol),
        "hbd": rdMolDescriptors.CalcNumHBD(mol),
        "tpsa": round(rdMolDescriptors.CalcTPSA(mol), 2),
        "rot_bonds": rdMolDescriptors.CalcNumRotatableBonds(mol),
    }


@app.route('/')
def index():
    return send_from_directory('static', 'index.html')


@app.route('/style.css')
def style():
    return send_from_directory('static', 'style.css')


@app.route('/app.js')
def js():
    return send_from_directory('static', 'app.js')


@app.route('/api/predict', methods=['POST'])
def predict():
    print("Received prediction request")
    if model is None:
        print("Error: Model not loaded")
        return jsonify({"error": "Model not loaded on server."}), 500

    data = request.get_json()
    if not data or 'smiles_list' not in data:
        print("Error: No data or smiles_list missing")
        return jsonify({"error": "No SMILES data provided."}), 400

    smiles_list = data['smiles_list']
    print(f"Processing {len(smiles_list)} SMILES")
    if not smiles_list:
        return jsonify({"error": "Empty SMILES list."}), 400

    results = []
    fps = []
    valid_entries = []

    for entry in smiles_list:
        smiles = entry.get('smiles', '').strip()
        name = entry.get('name', smiles)
        if not smiles:
            continue
        fp = smiles_to_maccs(smiles)
        if fp is not None:
            fps.append(fp)
            valid_entries.append({'smiles': smiles, 'name': name})
        else:
            results.append({
                'name': name,
                'smiles': smiles,
                'score': None,
                'label': 'Invalid',
                'valid': False,
                'properties': {}
            })

    if fps:
        try:
            X = np.array(fps)
            print(f"X shape: {X.shape}")
            predictions = model.predict(X)
            print("Predictions successful")
        except Exception as e:
            print(f"Prediction error: {e}")
            return jsonify({"error": f"Prediction failed: {str(e)}"}), 500
        scores = []
        try:
            proba = model.predict_proba(X)
            # Probability of class 1 (active)
            scores = proba[:, 1].tolist()
            is_classifier = True
        except Exception:
            scores = predictions.tolist()
            is_classifier = False

        for i, entry in enumerate(valid_entries):
            score = float(scores[i])
            label = 'Active' if score >= 0.6 else 'Inactive'

            results.append({
                'name': entry['name'],
                'smiles': entry['smiles'],
                'score': round(score, 4),
                'label': label,
                'valid': True,
                'properties': get_mol_properties(entry['smiles'])
            })

    # Sort by score descending
    results.sort(key=lambda x: x['score'] if x['score'] is not None else -1, reverse=True)

    active_count = sum(1 for r in results if r['label'] == 'Active')
    inactive_count = sum(1 for r in results if r['label'] == 'Inactive')
    invalid_count = sum(1 for r in results if r['label'] == 'Invalid')

    return jsonify({
        'results': results,
        'total': len(results),
        'active': active_count,
        'inactive': inactive_count,
        'invalid': invalid_count
    })


@app.route('/api/export', methods=['POST'])
def export_csv():
    data = request.get_json()
    results = data.get('results', [])

    output = io.StringIO()
    fieldnames = ['Name', 'SMILES', 'Score', 'Label', 'MW', 'LogP', 'HBA', 'HBD', 'TPSA', 'RotBonds']
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()

    for r in results:
        props = r.get('properties', {})
        writer.writerow({
            'Name': r.get('name', ''),
            'SMILES': r.get('smiles', ''),
            'Score': r.get('score', ''),
            'Label': r.get('label', ''),
            'MW': props.get('mw', ''),
            'LogP': props.get('logp', ''),
            'HBA': props.get('hba', ''),
            'HBD': props.get('hbd', ''),
            'TPSA': props.get('tpsa', ''),
            'RotBonds': props.get('rot_bonds', ''),
        })

    output.seek(0)
    return send_file(
        io.BytesIO(output.getvalue().encode('utf-8')),
        mimetype='text/csv',
        as_attachment=True,
        download_name='glp1_screening_results.csv'
    )


@app.route('/api/status', methods=['GET'])
def status():
    return jsonify({
        'model_loaded': model is not None,
        'model_type': str(type(model).__name__) if model else None
    })


if __name__ == '__main__':
    app.run(debug=True, port=5000)
