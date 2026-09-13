## 2024-06-25 - Avoid Math.min/max spread with large arrays
**Learning:** Using `Math.min(...largeArray)` or `Math.max(...largeArray)` triggers a V8 "Maximum call stack size exceeded" error when processing large datasets like point clouds or dense surveys. It also causes excessive memory overhead from intermediate array mappings (`xs`, `ys`).
**Action:** Always replace spread syntax with a standard `for` loop to compute bounding boxes or extrema for arrays that could potentially exceed ~100k items.
