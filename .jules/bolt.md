## 2024-05-18 - Math.max/min anti-pattern
**Learning:** Using spread operator with Math.min/max on large arrays (e.g., `Math.min(...xs)`) causes V8 'Maximum call stack size exceeded' errors and excessive memory allocation in this codebase.
**Action:** Use `reduce` or `for` loops instead when calculating bounds on large datasets.
