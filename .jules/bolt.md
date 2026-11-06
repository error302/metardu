## 2024-11-06 - [Performance Optimization: Spot Height Bounds Calculation]
**Learning:** Using the spread operator (`...`) with `Math.min()` and `Math.max()` on large arrays (like spot heights in topographic rendering) throws a 'Maximum call stack size exceeded' error and consumes excessive memory on V8.
**Action:** Always avoid using the spread operator on potentially large datasets for boundary calculations. Instead, use explicit `for` loops or `.reduce()` to iterate through array data.
