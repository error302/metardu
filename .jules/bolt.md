## 2024-11-01 - Avoid Math.min/max spread with large arrays
**Learning:** Using `Math.min(...arr)` or `Math.max(...arr)` on large datasets (like point clouds in `src/lib/compute/pointCloudVolume.ts` or other rendering components) can trigger V8 'Maximum call stack size exceeded' errors and cause excessive memory allocation.
**Action:** Replace `Math.min(...arr)` and `Math.max(...arr)` with standard `for` loops or `reduce` when calculating bounds on potentially large datasets (like point cloud bounds in `gridMethodVolume` and `getBounds`).
