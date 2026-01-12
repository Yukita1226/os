import os
os.environ["OMP_NUM_THREADS"] = "1"
import sys
import time
import numpy as np

# Configuration
N = 120000
K = 4
T = 50
np.random.seed(42)

# Initialization
X = np.random.rand(N, 2)
centroids = X[np.random.choice(N, K, replace=False)]

start_time = time.time()

# Main Iteration Loop
for _ in range(T):
    # Assignment Step
    # Calculate distances (N, K)
    distances = np.sqrt(((X[:, np.newaxis, :] - centroids) ** 2).sum(axis=2))
    labels = np.argmin(distances, axis=1)
    
    # Update Step
    new_centroids = np.array([X[labels == k].mean(axis=0) if np.any(labels == k) else centroids[k] for k in range(K)])
    centroids = new_centroids

duration = time.time() - start_time
final_result_value = centroids

print(f"Result: {final_result_value}")
print(f"Time taken: {duration} seconds")