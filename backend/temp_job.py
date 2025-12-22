import time  # <--- เพิ่มบรรทัดนี้

def bubble_sort_pure(arr):
    n = len(arr)
    for i in range(n):
        for j in range(0, n - i - 1):
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
    return arr

# ขยับความโหดเป็น 20,000 ตัว
limit = 50000 
data = list(range(limit, -1, -1))

print(f"CRITICAL TEST: Sorting {len(data)} elements with Pure Bubble Sort...")

start_time = time.time()
sorted_data = bubble_sort_pure(data)
end_time = time.time()

target_idx = 1000
print(f"Result: Value at index {target_idx} is {sorted_data[target_idx]}")
print(f"Time taken: {end_time - start_time:.2f} seconds")