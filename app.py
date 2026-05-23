import os
import sqlite3
import numpy as np
import requests
import re
import glob
from PIL import Image
from flask import Flask, request, jsonify, render_template, redirect, url_for, session
from werkzeug.security import generate_password_hash, check_password_hash
import google.genai as genai
from google.genai import types
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'  # Reduce TF logs
from tensorflow.keras.models import load_model
from tensorflow.keras.applications.mobilenet_v2 import preprocess_input

app = Flask(__name__)
app.secret_key = 'super_secret_agri_key'

# Classes for prediction
CLASSES = ["Healthy", "Rust", "Powdery Mildew"]

SUGGESTIONS = {
    "Healthy": {
        "treatment": "No treatment needed. Continue current schedules.",
        "tips": "Maintain regular inspections and monitor soil moisture.",
        "prevention": "Sanitize tools between uses. Buy disease-resistant seeds.",
        "environment": "Keep humidity moderate and ensure adequate sunlight."
    },
    "Rust": {
        "treatment": "Apply sulfur or copper-based fungicides. Remove infected leaves immediately.",
        "tips": "Avoid overhead watering, ensure plants are spaced properly to allow airflow.",
        "prevention": "Practice crop rotation and avoid planting the same crop in the exact spot.",
        "environment": "Provide good air circulation. Keep foliage dry, especially at night."
    },
    "Powdery Mildew": {
        "treatment": "Use potassium bicarbonate sprays or neem oil. Remove badly infected plant parts.",
        "tips": "Improve lighting, reduce humidity, and avoid over-fertilizing with nitrogen.",
        "prevention": "Select resistant varieties when available. Prune overgrown plants to increase airflow.",
        "environment": "Fungi thrive in warm, dry weather with high humidity at night. Increase daylight exposure."
    }
}

OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY")

def generate_weather_tip(temp, humidity):
    """Generates intelligent farming advice based on weather parameters."""
    if humidity > 70:
        return "High humidity warning! Conditions are highly favorable for fungal diseases. Ensure adequate spacing and avoid overhead watering."
    elif temp > 35:
        return "High temperature warning! Increase irrigation frequency and watch out for heat stress on your crops."
    else:
        return "Weather conditions are normal. Maintain standard care and watering schedules."

def get_weather():
    """Fetches real-time weather data for Gorakhpur."""
    try:
        url = f"http://api.openweathermap.org/data/2.5/weather?q=Gorakhpur&appid={OPENWEATHER_API_KEY}&units=metric"
        response = requests.get(url, timeout=5)
        if response.status_code == 200:
            data = response.json()
            temp = data['main']['temp']
            humidity = data['main']['humidity']
            desc = data['weather'][0]['description'].title()
            
            return {
                'temperature': temp,
                'humidity': humidity,
                'condition': desc,
                'tip': generate_weather_tip(temp, humidity),
                'error': False
            }
        else:
            return {'error': True, 'message': 'Weather data unavailable. Please try again later.'}
    except Exception:
        return {'error': True, 'message': 'Weather data unavailable. Please try again later.'}

models = {}

def get_db_connection():
    conn = sqlite3.connect('database.db')
    conn.row_factory = sqlite3.Row
    return conn

def load_ai_model():
    global models
    model_files = glob.glob('*.h5')
    for file in model_files:
        try:
            model_name = file.replace('.h5', '')
            models[model_name] = load_model(file)
            print(f"Successfully loaded model: {model_name}")
        except Exception as e:
            print(f"Error loading {file}: {e}")
            
    if not models:
        print("Warning: No .h5 models found. Please run train_dummy_model.py or upload models.")

@app.route('/')
def index():
    if 'user_id' in session:
        return redirect(url_for('dashboard'))
    return redirect(url_for('login'))

@app.route('/signup', methods=['GET', 'POST'])
def signup():
    if request.method == 'POST':
        name = request.form['name']
        email = request.form['email']
        password = request.form['password']
        hashed_pw = generate_password_hash(password)

        conn = get_db_connection()
        try:
            conn.execute('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', (name, email, hashed_pw))
            conn.commit()
            return redirect(url_for('login'))
        except sqlite3.IntegrityError:
            return render_template('signup.html', error='Email already exists.')
        finally:
            conn.close()

    return render_template('signup.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        email = request.form['email']
        password = request.form['password']

        conn = get_db_connection()
        user = conn.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()
        conn.close()

        valid = False
        if user:
            # Handle both hashed and old plain text to prevent breaking existing demo accounts
            if user['password'].startswith('scrypt:') or user['password'].startswith('pbkdf2:'):
                valid = check_password_hash(user['password'], password)
            else:
                valid = (user['password'] == password)

        if valid:
            session['user_id'] = user['id']
            session['user_name'] = user['name']
            return redirect(url_for('dashboard'))
        else:
            return render_template('login.html', error='Invalid credentials.')
            
    return render_template('login.html')

@app.route('/logout')
def logout():
    session.pop('user_id', None)
    session.pop('user_name', None)
    return redirect(url_for('login'))

@app.route('/dashboard')
def dashboard():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    
    weather_info = get_weather()
    return render_template('dashboard.html', name=session['user_name'], weather=weather_info)

@app.route('/predict', methods=['POST'])
def predict():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
        
    if 'image' not in request.files:
        return jsonify({'error': 'No image provided'}), 400

    file = request.files['image']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    if not models:
        return jsonify({'error': 'No models loaded on server.'}), 500

    try:
        # Preprocess the image for MobileNetV2
        img = Image.open(file.stream).convert('RGB')
        img = img.resize((224, 224))
        img_array = np.array(img, dtype=np.float32)
        img_array = np.expand_dims(img_array, axis=0)
        img_array = preprocess_input(img_array)

        # Predict with multiple models
        model_results_list = []
        all_probs = []
        
        for model_name, mdl in models.items():
            try:
                preds = mdl.predict(img_array)
                all_probs.append(preds[0])
                c_idx = int(np.argmax(preds[0]))
                conf = float(preds[0][c_idx]) * 100
                d_name = CLASSES[c_idx]
                model_results_list.append({
                    "model": model_name,
                    "prediction": d_name,
                    "confidence": f"{conf:.2f}%"
                })
            except Exception as e:
                print(f"Error during prediction with model {model_name}: {e}")

        if not model_results_list:
             return jsonify({'error': 'All models failed during prediction. Please check logs.'}), 500

        # Average Probability Ensemble
        avg_probs = np.mean(all_probs, axis=0)
        final_class_idx = int(np.argmax(avg_probs))
        final_confidence = float(avg_probs[final_class_idx]) * 100
        final_disease_name = CLASSES[final_class_idx]

        info = SUGGESTIONS[final_disease_name]

        # Store prediction in DB
        conn = get_db_connection()
        try:
            conn.execute('INSERT INTO predictions (user_id, disease, confidence) VALUES (?, ?, ?)',
                         (session['user_id'], final_disease_name, final_confidence))
            conn.commit()
        except Exception as e:
            print(f"Error saving prediction: {e}")
        finally:
            conn.close()

        return jsonify({
            'final_prediction': final_disease_name,
            'confidence': f"{final_confidence:.2f}%",
            'model_results': model_results_list,
            'disease': final_disease_name,
            'treatment': info['treatment'],
            'tips': info['tips'],
            'prevention': info['prevention'],
            'environment': info['environment']
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/submit_feedback', methods=['POST'])
def submit_feedback():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
        
    data = request.json
    disease_predicted = data.get('disease')
    is_correct = data.get('is_correct')
    comments = data.get('comments', '')
    
    conn = get_db_connection()
    try:
        conn.execute('INSERT INTO feedbacks (user_id, disease_predicted, is_correct, comments) VALUES (?, ?, ?, ?)',
                     (session['user_id'], disease_predicted, is_correct, comments))
        conn.commit()
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()
        
    return jsonify({'success': True, 'message': 'Feedback received successfully!'})

@app.route('/api/analytics')
def analytics():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    conn = get_db_connection()
    try:
        # Fetch Prediction History
        history_rows = conn.execute('SELECT disease, confidence, timestamp FROM predictions WHERE user_id = ? ORDER BY timestamp DESC LIMIT 15', (session['user_id'],)).fetchall()
        history = [{'disease': row['disease'], 'confidence': row['confidence'], 'timestamp': row['timestamp']} for row in history_rows]
        
        # Fetch Disease Distribution
        dist_rows = conn.execute('SELECT disease, COUNT(*) as count FROM predictions WHERE user_id = ? GROUP BY disease', (session['user_id'],)).fetchall()
        distribution = {row['disease']: row['count'] for row in dist_rows}
        
        return jsonify({'history': history, 'distribution': distribution})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@app.route('/chat', methods=['POST'])
@app.route('/api/chat', methods=['POST'])
def chat():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
        
    data = request.json
    message = data.get('message', '').strip()
    
    if not message:
        return jsonify({'reply': "Please ask a valid question."})
    
    if 'chat_history' not in session:
        session['chat_history'] = []
        
    gemini_api_key = os.getenv('GEMINI_API_KEY')
    if not gemini_api_key:
        print("Error: GEMINI_API_KEY environment variable is not set.")
        return jsonify({'reply': "AI service error"})
        
    try:
        client = genai.Client(api_key=gemini_api_key)
        
        system_prompt = "You are an expert agriculture assistant helping farmers with crop diseases, fertilizers, irrigation, and weather. Give clear and practical advice."
        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=0.7
        )
        
        contents = []
        for msg in session['chat_history']:
            role = "user" if msg['role'] == "user" else "model"
            contents.append(
                types.Content(
                    role=role,
                    parts=[types.Part.from_text(text=msg['content'])]
                )
            )
            
        contents.append(
            types.Content(
                role="user",
                parts=[types.Part.from_text(text=message)]
            )
        )
        
        response = client.models.generate_content(
            model='gemini-1.5-flash',
            contents=contents,
            config=config
        )
        ai_reply = response.text
        
        session['chat_history'].append({"role": "user", "content": message})
        session['chat_history'].append({"role": "assistant", "content": ai_reply})
        
        # Store last 5 interactions (10 messages total)
        if len(session['chat_history']) > 10:
            session['chat_history'] = session['chat_history'][-10:]
            
        session.modified = True
        return jsonify({'reply': ai_reply})
    except Exception as e:
        print(f"Gemini API Error: {str(e)}")
        return jsonify({'reply': "I am sorry, our AI advisor ran into a technical hurdle. Please try your question again."})

if __name__ == '__main__':
    load_ai_model()
    # Only run locally during dev
    app.run(debug=True)


