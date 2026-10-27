## 2024-05-18 - Avoid spread operator with Math.min/max for large arrays
**Learning:** Using `Math.min(...array.map(...))` or `Math.max(...array.map(...))` on large datasets (like topographic spot heights) can exceed the V8 maximum call stack size limit and result in excessive memory allocation.
**Action:** Use standard `for` loops or array `.reduce()` functions to iterate over large datasets for computing bounds or min/max values to avoid V8 call stack limits and unnecessary intermediary array allocations.
