import tensorflow as tf
from tensorflow.keras import layers, models

def create_model():
    model = models.Sequential([
        layers.Input(shape=(224, 224, 3)),
        layers.Conv2D(32, (3, 3), activation='relu'),
        layers.MaxPooling2D(),
        layers.Flatten(),
        layers.Dense(64, activation='relu'),
        layers.Dense(3, activation='softmax') # 3 Classes: Healthy, Rust, Powdery Mildew
    ])
    model.compile(optimizer='adam', loss='sparse_categorical_crossentropy', metrics=['accuracy'])
    return model

if __name__ == '__main__':
    print("Generating dummy model...")
    model = create_model()
    # Provide a tiny dummy dataset to initialize everything perfectly
    dummy_x = tf.random.uniform((1, 224, 224, 3))
    dummy_y = tf.constant([0], dtype=tf.int32)
    model.fit(dummy_x, dummy_y, epochs=1, verbose=0)
    model.save('model.h5')
    print("Dummy model 'model.h5' saved successfully! Classes assumed: 0: Healthy, 1: Rust, 2: Powdery Mildew.")
