document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('image-input');
    const dropArea = document.getElementById('drop-area');
    const previewContainer = document.getElementById('image-preview');
    const previewImg = document.getElementById('preview-img');
    const clearBtn = document.getElementById('clear-btn');
    const analyzeBtn = document.getElementById('analyze-btn');
    const uploadForm = document.getElementById('upload-form');
    
    const loadingDiv = document.getElementById('loading');
    const resultSection = document.getElementById('result-section');
    
    // Drag & Drop visual effects
    if (dropArea) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropArea.addEventListener(eventName, preventDefaults, false);
        });

        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }

        ['dragenter', 'dragover'].forEach(eventName => {
            dropArea.addEventListener(eventName, () => {
                dropArea.classList.add('dragover');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropArea.addEventListener(eventName, () => {
                dropArea.classList.remove('dragover');
            }, false);
        });

        dropArea.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files.length) {
                fileInput.files = files;
                handleFiles(files[0]);
            }
        }, false);

        fileInput.addEventListener('change', function() {
            if (this.files && this.files[0]) {
                handleFiles(this.files[0]);
            }
        });
    }

    function handleFiles(file) {
        if (!file.type.startsWith('image/')) {
            alert('Please upload an image file.');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            previewImg.src = e.target.result;
            dropArea.classList.add('hidden');
            previewContainer.classList.remove('hidden');
            analyzeBtn.disabled = false;
        };
        reader.readAsDataURL(file);
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            fileInput.value = '';
            previewImg.src = '';
            previewContainer.classList.add('hidden');
            dropArea.classList.remove('hidden');
            analyzeBtn.disabled = true;
            resultSection.classList.add('hidden'); // hide past results
            
            // reset confidence bar
            document.getElementById('confidence-bar').style.width = '0%';
        });
    }

    if (uploadForm) {
        uploadForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (!fileInput.files || !fileInput.files[0]) return;

            const formData = new FormData();
            formData.append('image', fileInput.files[0]);

            // UI State change
            analyzeBtn.disabled = true;
            loadingDiv.classList.remove('hidden');
            resultSection.classList.add('hidden');
            document.getElementById('confidence-bar').style.width = '0%'; // Reset

            try {
                const response = await fetch('/predict', {
                    method: 'POST',
                    body: formData
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Server error occurred');
                }

                // Populate data
                document.getElementById('disease-name').textContent = data.disease;
                document.getElementById('confidence-text').textContent = data.confidence;
                document.getElementById('treatment-text').textContent = data.treatment;
                document.getElementById('tips-text').textContent = data.tips;
                document.getElementById('prevention-text').textContent = data.prevention || '---';
                document.getElementById('environment-text').textContent = data.environment || '---';

                // Refresh Analytics after prediction
                if (window.fetchAnalytics) {
                    window.fetchAnalytics();
                }
                
                // Color coding based on result
                const diseaseEl = document.getElementById('disease-name');
                if (data.disease === 'Healthy') {
                    diseaseEl.style.color = 'var(--success)';
                    document.getElementById('confidence-bar').style.backgroundColor = 'var(--success)';
                } else {
                    diseaseEl.style.color = 'var(--error)';
                    document.getElementById('confidence-bar').style.backgroundColor = 'var(--error)';
                }

                // Show results
                loadingDiv.classList.add('hidden');
                resultSection.classList.remove('hidden');
                resultSection.classList.add('slide-up');
                
                setTimeout(() => {
                    document.getElementById('confidence-bar').style.width = data.confidence;
                }, 100);

                // Reset feedback UI state for new image
                document.getElementById('feedback-form-container').classList.add('hidden');
                document.getElementById('feedback-success').classList.add('hidden');
                document.getElementById('feedback-comments').value = '';
                document.getElementById('btn-feedback-yes').classList.remove('primary-btn');
                document.getElementById('btn-feedback-no').classList.remove('primary-btn');
                document.getElementById('btn-feedback-yes').classList.add('outline-btn');
                document.getElementById('btn-feedback-no').classList.add('outline-btn');

                // Variables for feedback
                window.currentPrediction = data.disease;
                window.currentFeedbackIsCorrect = null;

            } catch (error) {
                loadingDiv.classList.add('hidden');
                alert(`Error: ${error.message}`);
            } finally {
                analyzeBtn.disabled = false;
            }
        });
    }

    // Feedback handling
    const btnFeedbackYes = document.getElementById('btn-feedback-yes');
    const btnFeedbackNo = document.getElementById('btn-feedback-no');
    const feedbackFormContainer = document.getElementById('feedback-form-container');
    const btnSubmitFeedback = document.getElementById('btn-submit-feedback');
    const feedbackSuccess = document.getElementById('feedback-success');

    if (btnFeedbackYes && btnFeedbackNo) {
        btnFeedbackYes.addEventListener('click', () => {
            window.currentFeedbackIsCorrect = true;
            btnFeedbackYes.classList.replace('outline-btn', 'primary-btn');
            btnFeedbackNo.classList.replace('primary-btn', 'outline-btn');
            submitQuickFeedback();
        });

        btnFeedbackNo.addEventListener('click', () => {
            window.currentFeedbackIsCorrect = false;
            btnFeedbackNo.classList.replace('outline-btn', 'primary-btn');
            btnFeedbackYes.classList.replace('primary-btn', 'outline-btn');
            feedbackFormContainer.classList.remove('hidden'); // Show comment box for negative feedback
        });

        btnSubmitFeedback.addEventListener('click', async () => {
            await submitDetailedFeedback();
        });
    }

    async function submitQuickFeedback() {
        // Automatically submit for "Yes" to save clicks
        await submitFeedbackData(window.currentPrediction, true, "");
        feedbackSuccess.classList.remove('hidden');
        feedbackFormContainer.classList.add('hidden');
    }

    async function submitDetailedFeedback() {
        const comments = document.getElementById('feedback-comments').value;
        const isCorrect = window.currentFeedbackIsCorrect === true;
        await submitFeedbackData(window.currentPrediction, isCorrect, comments);
        feedbackFormContainer.classList.add('hidden');
        feedbackSuccess.classList.remove('hidden');
    }

    async function submitFeedbackData(disease, isCorrect, comments) {
        try {
            await fetch('/submit_feedback', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    disease: disease,
                    is_correct: isCorrect,
                    comments: comments
                })
            });
        } catch (error) {
            console.error('Failed to submit feedback:', error);
        }
    }

    // --- Analytics Charts ---
    let distChart, historyChart;

    window.fetchAnalytics = async function() {
        try {
            const res = await fetch('/api/analytics');
            if (!res.ok) return;
            const data = await res.json();
            
            renderDistributionChart(data.distribution);
            renderHistoryChart(data.history);
        } catch (error) {
            console.error("Failed to fetch analytics:", error);
        }
    };

    function renderDistributionChart(distribution) {
        const ctx = document.getElementById('distribution-chart');
        if (!ctx) return;
        
        if (distChart) distChart.destroy();
        
        const labels = Object.keys(distribution);
        const values = Object.values(distribution);
        
        const backgroundColors = labels.map(label => {
            if(label === 'Healthy') return 'rgba(34, 197, 94, 0.7)'; // success
            if(label === 'Rust') return 'rgba(239, 68, 68, 0.7)'; // error
            return 'rgba(245, 158, 11, 0.7)'; // warning
        });

        distChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: backgroundColors,
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'bottom' },
                    title: { display: true, text: 'Disease Distribution' }
                }
            }
        });
    }

    function renderHistoryChart(history) {
        const ctx = document.getElementById('history-chart');
        if (!ctx) return;
        
        if (historyChart) historyChart.destroy();
        
        // Reverse to show oldest to newest left to right
        const sortedHistory = [...history].reverse();
        const labels = sortedHistory.map(h => new Date(h.timestamp).toLocaleDateString());
        const data = sortedHistory.map(h => parseFloat(h.confidence));

        historyChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Confidence (%)',
                    data: data,
                    borderColor: 'rgba(16, 185, 129, 1)',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    tension: 0.3,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false },
                    title: { display: true, text: 'Prediction Confidence History' }
                },
                scales: {
                    y: { beginAtZero: true, max: 100 }
                }
            }
        });
    }

    // Initialize analytics on load
    if (document.getElementById('distribution-chart')) {
        window.fetchAnalytics();
    }

    // --- Camera Capture Logic ---
    const cameraBtn = document.getElementById('camera-btn');
    const cameraContainer = document.getElementById('camera-container');
    const cameraVideo = document.getElementById('camera-video');
    const captureBtn = document.getElementById('capture-btn');
    const closeCameraBtn = document.getElementById('close-camera-btn');
    const cameraCanvas = document.getElementById('camera-canvas');
    let stream = null;

    if (cameraBtn) {
        cameraBtn.addEventListener('click', async () => {
            if (dropArea) dropArea.classList.add('hidden');
            cameraContainer.classList.remove('hidden');
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                cameraVideo.srcObject = stream;
            } catch (err) {
                alert("Could not access camera: " + err.message);
                closeCameraFunc();
            }
        });
    }

    function closeCameraFunc() {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
        }
        cameraContainer.classList.add('hidden');
        if (dropArea) dropArea.classList.remove('hidden');
    }

    if (closeCameraBtn) {
        closeCameraBtn.addEventListener('click', closeCameraFunc);
    }

    if (captureBtn) {
        captureBtn.addEventListener('click', () => {
            if (!stream) return;
            cameraCanvas.width = cameraVideo.videoWidth;
            cameraCanvas.height = cameraVideo.videoHeight;
            cameraCanvas.getContext('2d').drawImage(cameraVideo, 0, 0);
            
            // convert canvas to blob
            cameraCanvas.toBlob((blob) => {
                const file = new File([blob], "camera_capture.jpg", { type: "image/jpeg" });
                
                // create a DataTransfer object to simulate file input change
                const dt = new DataTransfer();
                dt.items.add(file);
                fileInput.files = dt.files;
                
                // Trigger preview
                const reader = new FileReader();
                reader.onload = (e) => {
                    previewImg.src = e.target.result;
                    cameraContainer.classList.add('hidden');
                    previewContainer.classList.remove('hidden');
                    analyzeBtn.disabled = false;
                };
                reader.readAsDataURL(file);
                
                // Stop camera
                if (stream) {
                    stream.getTracks().forEach(track => track.stop());
                    stream = null;
                }
            }, "image/jpeg", 0.9);
        });
    }

    // --- Chatbot Logic ---
    const toggleChatBtn = document.getElementById('toggle-chat-btn');
    const chatWidget = document.getElementById('chat-widget');
    const closeChatCb = document.getElementById('close-chat');
    const chatBody = document.getElementById('chat-body');
    const chatInput = document.getElementById('chat-input');
    const sendChatBtn = document.getElementById('send-chat');

    if (toggleChatBtn) {
        toggleChatBtn.addEventListener('click', () => {
            chatWidget.style.display = chatWidget.style.display === 'none' ? 'block' : 'none';
        });
        
        closeChatCb.addEventListener('click', () => {
            chatWidget.style.display = 'none';
        });

        async function sendMessage() {
            const text = chatInput.value.trim();
            if (!text) return;

            // append user message
            const msgDiv = document.createElement('div');
            msgDiv.className = 'chat-message user-message';
            msgDiv.style.cssText = 'background: var(--primary); color: white; padding: 0.75rem; border-radius: 1rem 1rem 0 1rem; width: fit-content; max-width: 80%; align-self: flex-end; font-size: 0.9rem;';
            msgDiv.textContent = text;
            chatBody.appendChild(msgDiv);
            chatInput.value = '';
            chatBody.scrollTop = chatBody.scrollHeight;

            // show typing...
            const typingDiv = document.createElement('div');
            typingDiv.style.cssText = 'font-size: 0.8rem; color: #888; margin-top: -0.5rem;';
            typingDiv.textContent = 'Assistant is typing...';
            chatBody.appendChild(typingDiv);

            try {
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: text })
                });
                const data = await response.json();

                // remove typing
                chatBody.removeChild(typingDiv);

                // append bot message
                const botDiv = document.createElement('div');
                botDiv.className = 'chat-message bot-message';
                botDiv.style.cssText = 'background: #e2e8f0; padding: 0.75rem; border-radius: 1rem 1rem 1rem 0; width: fit-content; max-width: 80%; font-size: 0.9rem;';
                botDiv.textContent = data.reply;
                chatBody.appendChild(botDiv);
                chatBody.scrollTop = chatBody.scrollHeight;
            } catch (err) {
                chatBody.removeChild(typingDiv);
                console.error("Chat error", err);
            }
        }

        sendChatBtn.addEventListener('click', sendMessage);
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
    }

});
