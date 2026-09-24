## 2024-10-27 - Point Cloud Bounding Box Bottleneck
**Learning:** Using the spread operator (`...`) with `Math.min()` or `Math.max()` on large arrays, such as point cloud data (`surface1` and `surface2`), causes V8 to throw a "Maximum call stack size exceeded" error. It also leads to excessive memory allocation because it passes every element as an individual argument to the function.
**Action:** Always use explicit `for` loops or `.reduce()` when iterating over large datasets to find bounding boxes or extrema instead of relying on `Math.max(...arr)`.
