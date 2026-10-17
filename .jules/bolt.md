## 2024-10-17 - Avoid Math.min/Math.max with spread operator on large arrays
**Learning:** Using `Math.min(...largeArray)` or `Math.max(...largeArray)` can throw "Maximum call stack size exceeded" errors and consume excessive memory for large arrays (like point clouds), which can have hundreds of thousands of points.
**Action:** Use a `reduce` function or a `for` loop to compute the min/max of large arrays instead of relying on the spread operator.
