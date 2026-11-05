
## 2024-05-15 - [Avoid Spread Operator with Math.max/min on Large Arrays]
**Learning:** Using `Math.max(...array)` or `Math.min(...array)` causes "Maximum call stack size exceeded" errors and excessive memory allocation in V8 when the array is very large (e.g. point cloud data like `spotHeights` mapping to coordinates). This is an anti-pattern when processing datasets.
**Action:** Always compute bounds for large datasets using a single O(N) `for` loop or `reduce` rather than array iteration methods chained with spread operators.
