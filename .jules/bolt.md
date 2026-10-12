## 2023-11-20 - Avoid Math.min/max with spread operator on large arrays
**Learning:** Using `Math.min(...largeArray)` or `Math.max(...largeArray)` with the spread operator on large datasets (such as point clouds or topographic contours/spot heights) can cause V8 "Maximum call stack size exceeded" errors and excessive memory allocation because the array gets unrolled into individual function arguments.
**Action:** Always compute bounds over large datasets using explicit `for` loops or `reduce` instead of combining `map()` and the spread operator `...`.
