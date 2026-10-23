## 2024-10-23 - Optimize Bounds Calculation Using Spread Operator
**Learning:** Using the spread operator (`...`) with `Math.min()` or `Math.max()` combined with `.map()` on large arrays, such as point cloud dataset bounds calculation, causes Next.js to crash with a 'Maximum call stack size exceeded' error and excessive memory allocation.
**Action:** Avoid spread syntax on indeterminate arrays for finding minimums or maximums. Use manual variable initialization (`Infinity`, `-Infinity`) coupled with a `for...of` loop or a `reduce()` function instead.
