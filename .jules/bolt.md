
## 2024-11-20 - V8 Call Stack Limits with Spread Operator
**Learning:** Using the spread operator (`...`) inside functions like `Math.min()` or `Math.max()` on extremely large arrays (e.g., millions of point cloud data elements) throws a critical V8 "Maximum call stack size exceeded" error. It also unnecessarily allocates large temporary arrays, hurting performance.
**Action:** When calculating bounds (min/max) for large datasets, always use a `for` loop or `reduce` instead of spreading elements to avoid call stack limits and unnecessary memory allocation.
