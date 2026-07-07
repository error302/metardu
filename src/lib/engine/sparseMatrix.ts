/**
 * @module sparseMatrix
 *
 * Sparse linear algebra primitives for large survey control networks.
 *
 * The dense Gauss-Jordan solver in `leastSquares.ts` is O(n³) for both time
 * and memory — it breaks down past ~150 stations because the normal matrix
 * N = Aᵀ P A has n² entries (n = 2 × stations for 2D, 3 × stations for 3D).
 *
 * For a typical control network, each observation only touches 2–3 stations,
 * so the design matrix A is >99% zeros past ~200 stations. The normal matrix
 * N is similarly sparse (banded structure for traverses, block-sparse for
 * networks). Exploiting this sparsity gives:
 *
 *   - Memory: O(nnz) instead of O(n²)  (nnz = number of non-zeros)
 *   - Time:   O(nnz · √n) for sparse Cholesky vs O(n³) for dense
 *
 * Concretely, a 1,000-station 2D network:
 *   - Dense: 4,000,000 matrix entries, ~30s solve time
 *   - Sparse: ~12,000 non-zeros, ~50ms solve time
 *
 * References:
 *   - Davis, T.A. (2006) "Direct Methods for Sparse Linear Systems" (SIAM)
 *   - George, A. & Liu, J.W-H. (1981) "Computer Solution of Large Sparse
 *     Positive Definite Systems" (Prentice-Hall)
 *   - Liu, J.W-H. (1990) "The role of elimination trees in sparse factorization"
 *     SIAM J. Matrix Anal. Appl. 11(1)
 *   - Erisman, A.M. & Tinney, W.F. (1975) "On computing certain elements of
 *     the inverse of a sparse matrix" Comm. ACM 18(3)
 */

// ---------------------------------------------------------------------------
// Types — CSR format
// ---------------------------------------------------------------------------

/**
 * Compressed Sparse Row matrix.
 *
 * - `rowPtr` has length (rows + 1); rowPtr[i]..rowPtr[i+1] is the range of
 *   indices into `colIdx` and `values` for row i.
 * - `colIdx` and `values` have length nnz (number of non-zeros).
 *
 * For symmetric matrices (like the normal matrix N), we store only the lower
 * triangle by default — `symmetric: true` flag.
 */
export interface SparseMatrix {
  rows: number
  cols: number
  rowPtr: number[]   // length rows + 1
  colIdx: number[]   // length nnz
  values: number[]   // length nnz, parallel to colIdx
  symmetric?: boolean // if true, only lower triangle stored
}

// ---------------------------------------------------------------------------
// Construction helpers
// ---------------------------------------------------------------------------

/**
 * Build a sparse matrix from a list of triplet entries (row, col, value).
 * Duplicate entries for the same (row, col) are summed.
 *
 * For symmetric matrices, only lower-triangle entries (col <= row) are kept;
 * upper-triangle entries are transposed automatically.
 *
 * Complexity: O(nnz log nnz) due to sorting.
 */
export function fromTriplets(
  rows: number,
  cols: number,
  triplets: Array<{ row: number; col: number; value: number }>,
  symmetric = false,
): SparseMatrix {
  // Normalize: for symmetric, only keep lower triangle
  const normalized = symmetric
    ? triplets.map((t) => (t.col > t.row ? { row: t.col, col: t.row, value: t.value } : t))
    : triplets

  // Filter zeros
  const nonZero = normalized.filter((t) => t.value !== 0)

  // Sort by row, then by col
  nonZero.sort((a, b) => (a.row !== b.row ? a.row - b.row : a.col - b.col))

  // Build CSR with duplicate summing
  const rowPtr = new Array(rows + 1).fill(0)
  const colIdx: number[] = []
  const values: number[] = []

  let prevRow = -1
  let prevCol = -1
  for (const t of nonZero) {
    // Fill rowPtr for skipped rows
    if (t.row !== prevRow) {
      for (let r = prevRow + 1; r <= t.row; r++) rowPtr[r] = colIdx.length
      prevRow = t.row
      prevCol = -1
    }
    if (t.col === prevCol) {
      values[values.length - 1] += t.value
    } else {
      colIdx.push(t.col)
      values.push(t.value)
      prevCol = t.col
    }
  }
  // Fill remaining rowPtr entries
  for (let r = prevRow + 1; r <= rows; r++) rowPtr[r] = colIdx.length

  return { rows, cols, rowPtr, colIdx, values, symmetric }
}

/**
 * Convert a dense matrix to sparse.
 * For symmetric=true, only the lower triangle is stored.
 */
export function fromDense(A: number[][], symmetric = false): SparseMatrix {
  const rows = A.length
  const cols = A[0]?.length ?? 0
  const triplets: Array<{ row: number; col: number; value: number }> = []
  for (let i = 0; i < rows; i++) {
    const startCol = symmetric ? 0 : 0
    const endCol = symmetric ? i + 1 : cols
    for (let j = startCol; j < endCol; j++) {
      if (A[i][j] !== 0) {
        triplets.push({ row: i, col: j, value: A[i][j] })
      }
    }
  }
  return fromTriplets(rows, cols, triplets, symmetric)
}

/**
 * Convert a sparse matrix to dense. For tests and small matrices only.
 */
export function toDense(M: SparseMatrix): number[][] {
  const out: number[][] = Array.from({ length: M.rows }, () => new Array(M.cols).fill(0))
  for (let r = 0; r < M.rows; r++) {
    for (let idx = M.rowPtr[r]; idx < M.rowPtr[r + 1]; idx++) {
      const c = M.colIdx[idx]
      out[r][c] = M.values[idx]
      if (M.symmetric && c !== r) {
        out[c][r] = M.values[idx]
      }
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Basic operations
// ---------------------------------------------------------------------------

/**
 * Sparse matrix-vector multiplication: y = M · x
 *
 * For symmetric matrices stored as lower triangle, both lower and upper
 * contributions are accumulated.
 *
 * Complexity: O(nnz)
 */
export function sparseMatVec(M: SparseMatrix, x: number[]): number[] {
  if (x.length !== M.cols) {
    throw new Error(`Dimension mismatch: matrix has ${M.cols} cols, vector has ${x.length}`)
  }
  const y = new Array(M.rows).fill(0)

  if (M.symmetric) {
    // Lower triangle: M[i, j] for j <= i
    // y[i] += M[i, j] * x[j]  (j <= i)
    // y[j] += M[i, j] * x[i]  (j < i, since M is symmetric)
    for (let r = 0; r < M.rows; r++) {
      for (let idx = M.rowPtr[r]; idx < M.rowPtr[r + 1]; idx++) {
        const c = M.colIdx[idx]
        const v = M.values[idx]
        y[r] += v * x[c]
        if (c !== r) {
          y[c] += v * x[r]
        }
      }
    }
  } else {
    for (let r = 0; r < M.rows; r++) {
      let sum = 0
      for (let idx = M.rowPtr[r]; idx < M.rowPtr[r + 1]; idx++) {
        sum += M.values[idx] * x[M.colIdx[idx]]
      }
      y[r] = sum
    }
  }

  return y
}

/**
 * Compute N = Aᵀ · D · A where A is a sparse matrix (m × n) and D is a diagonal
 * matrix (m × m). The result is symmetric positive semi-definite (n × n).
 *
 * This is the workhorse for assembling normal equations: N = Aᵀ P A where P
 * is the diagonal weight matrix.
 *
 * Complexity: O(nnz(A) × k) where k is the average row degree of A.
 */
export function ataDiag(
  A: SparseMatrix,
  d: number[] // diagonal of D, length m
): SparseMatrix {
  if (d.length !== A.rows) {
    throw new Error(`Dimension mismatch: A has ${A.rows} rows, d has ${d.length} entries`)
  }

  const n = A.cols
  const triplets: Array<{ row: number; col: number; value: number }> = []

  for (let i = 0; i < A.rows; i++) {
    const rowStart = A.rowPtr[i]
    const rowEnd = A.rowPtr[i + 1]
    const diagVal = d[i]
    if (diagVal === 0) continue

    // Extract this row's (col, val) pairs
    const entries: Array<{ col: number; val: number }> = []
    for (let idx = rowStart; idx < rowEnd; idx++) {
      entries.push({ col: A.colIdx[idx], val: A.values[idx] })
    }

    // Outer product: entries × entriesᵀ, scaled by diagVal
    // Only store lower triangle (j >= k)
    for (let a = 0; a < entries.length; a++) {
      for (let b = 0; b < entries.length; b++) {
        const j = entries[a].col
        const k = entries[b].col
        if (j >= k) {
          triplets.push({ row: j, col: k, value: entries[a].val * entries[b].val * diagVal })
        }
      }
    }
  }

  return fromTriplets(n, n, triplets, true)
}

/**
 * Compute u = Aᵀ · D · b where A is sparse (m × n), D is diagonal (m × m),
 * and b is a vector (m × 1). Result is length n.
 *
 * Complexity: O(nnz(A))
 */
export function atdbDiag(A: SparseMatrix, d: number[], b: number[]): number[] {
  if (d.length !== A.rows) throw new Error('d dimension mismatch')
  if (b.length !== A.rows) throw new Error('b dimension mismatch')

  const n = A.cols
  const u = new Array(n).fill(0)
  for (let i = 0; i < A.rows; i++) {
    const factor = d[i] * b[i]
    if (factor === 0) continue
    for (let idx = A.rowPtr[i]; idx < A.rowPtr[i + 1]; idx++) {
      u[A.colIdx[idx]] += A.values[idx] * factor
    }
  }
  return u
}

// ---------------------------------------------------------------------------
// AMD (Approximate Minimum Degree) ordering
// ---------------------------------------------------------------------------

/**
 * Simplified AMD ordering for sparse symmetric matrices.
 *
 * Returns a permutation array P (length n) such that A[P[i], P[j]] is the
 * permuted matrix. P[i] is the original index that becomes position i.
 */
export function approximateMinimumDegree(M: SparseMatrix): number[] {
  const n = M.rows
  if (n !== M.cols) throw new Error('AMD requires square matrix')

  // Build adjacency lists (symmetric, excluding diagonal)
  const adj: Set<number>[] = new Array(n).fill(null).map(() => new Set())
  for (let r = 0; r < n; r++) {
    for (let idx = M.rowPtr[r]; idx < M.rowPtr[r + 1]; idx++) {
      const c = M.colIdx[idx]
      if (c !== r) {
        adj[r].add(c)
        adj[c].add(r)
      }
    }
  }

  const degree = new Array(n).fill(0).map((_, i) => adj[i].size)
  const eliminated = new Array(n).fill(false)
  const perm: number[] = []

  for (let step = 0; step < n; step++) {
    // Find uneliminated node with minimum degree
    let minDeg = Infinity
    let minNode = -1
    for (let i = 0; i < n; i++) {
      if (!eliminated[i] && degree[i] < minDeg) {
        minDeg = degree[i]
        minNode = i
      }
    }
    if (minNode === -1) break

    perm.push(minNode)
    eliminated[minNode] = true

    // Eliminate: connect all neighbors to each other (fill-in)
    const neighbors = Array.from(adj[minNode]).filter((x) => !eliminated[x])
    for (let i = 0; i < neighbors.length; i++) {
      for (let j = i + 1; j < neighbors.length; j++) {
        adj[neighbors[i]].add(neighbors[j])
        adj[neighbors[j]].add(neighbors[i])
      }
      adj[neighbors[i]].delete(minNode)
      degree[neighbors[i]] = adj[neighbors[i]].size
    }
  }

  return perm
}

/**
 * Apply a permutation: returns the matrix A[P, P] for symmetric matrices.
 * The result is also symmetric (lower triangle stored).
 */
export function permuteSymmetric(M: SparseMatrix, P: number[]): SparseMatrix {
  const n = M.rows
  if (P.length !== n) throw new Error('Permutation length mismatch')

  // Build inverse permutation: Pinv[original] = new
  const Pinv = new Array(n)
  for (let i = 0; i < n; i++) Pinv[P[i]] = i

  // Walk original matrix, push triplets with permuted indices
  const triplets: Array<{ row: number; col: number; value: number }> = []
  for (let r = 0; r < n; r++) {
    for (let idx = M.rowPtr[r]; idx < M.rowPtr[r + 1]; idx++) {
      const c = M.colIdx[idx]
      const v = M.values[idx]
      const newR = Pinv[r]
      const newC = Pinv[c]
      // Lower triangle of permuted matrix
      const lo = Math.min(newR, newC)
      const hi = Math.max(newR, newC)
      triplets.push({ row: hi, col: lo, value: v })
    }
  }

  return fromTriplets(n, n, triplets, true)
}

// ---------------------------------------------------------------------------
// Symbolic factorization (column Cholesky)
// ---------------------------------------------------------------------------

export interface SymbolicFactor {
  n: number
  /** Elimination tree: parent[j] = smallest i > j with L[i, j] != 0, or -1 for root. */
  parent: number[]
  /** For each column j, the row indices of non-zeros in L[:, j] (including j, sorted ascending). */
  colRows: number[][]
  /** For each column j, the count of non-zeros in L[:, j] (including diagonal). */
  colCount: number[]
}

/**
 * Symbolic Cholesky factorization: compute the sparsity pattern of L given
 * the sparsity pattern of the (symmetric, lower-triangle-stored) matrix.
 *
 * Algorithm:
 *   1. Build column adjacency (non-zero rows below diagonal in each column)
 *   2. Compute elimination tree using Liu's algorithm with path compression
 *   3. Compute column patterns: pattern[L[:, j]] = {j} ∪ colAdj[j] ∪ (union of
 *      children's patterns, restricted to rows > j)
 *
 * Reference: Davis (2006) Ch. 6 — "Symbolic factorization"
 */
export function symbolicFactorize(M: SparseMatrix): SymbolicFactor {
  const n = M.rows
  if (n !== M.cols || !M.symmetric) {
    throw new Error('Symbolic factorization requires symmetric matrix (lower triangle)')
  }

  // Build column adjacency: colAdj[j] = list of rows r > j where M[r, j] != 0
  const colAdj: number[][] = new Array(n).fill(null).map(() => [])
  for (let r = 0; r < n; r++) {
    for (let idx = M.rowPtr[r]; idx < M.rowPtr[r + 1]; idx++) {
      const c = M.colIdx[idx]
      if (c < r) {
        colAdj[c].push(r)
      }
    }
  }

  // Compute elimination tree (Liu's algorithm with path compression)
  const parent = new Array(n).fill(-1)
  const ancestor = new Array(n).fill(-1) // path-compression "w" array

  for (let k = 0; k < n; k++) {
    for (const i of colAdj[k]) {
      // Walk up i's subtree with path compression
      let root = i
      while (ancestor[root] !== -1) {
        const a = ancestor[root]
        // Path compression: point root directly to grandparent if it exists
        if (ancestor[a] !== -1) {
          ancestor[root] = ancestor[a]
        }
        root = a
      }
      // root is now the topmost visited ancestor of i
      if (root !== k && parent[root] === -1) {
        parent[root] = k
        ancestor[root] = k
      }
    }
  }

  // Build children list (children[j] = list of c with parent[c] = j)
  const children: number[][] = new Array(n).fill(null).map(() => [])
  for (let j = 0; j < n; j++) {
    if (parent[j] !== -1) {
      children[parent[j]].push(j)
    }
  }

  // Compute column patterns in DECREASING order (children before parents)
  const colRows: number[][] = new Array(n).fill(null).map(() => [])
  const colCount: number[] = new Array(n).fill(0)

  for (let j = n - 1; j >= 0; j--) {
    const rows = new Set<number>([j])
    // Column j of M's non-zeros (rows > j)
    for (const r of colAdj[j]) {
      rows.add(r)
    }
    // Children's patterns (restricted to rows > j)
    for (const c of children[j]) {
      for (const r of colRows[c]) {
        if (r > j) rows.add(r)
      }
    }
    colRows[j] = Array.from(rows).sort((a, b) => a - b)
    colCount[j] = colRows[j].length
  }

  return { n, parent, colRows, colCount }
}

// ---------------------------------------------------------------------------
// Numeric Cholesky factorization (left-looking)
// ---------------------------------------------------------------------------

export interface SparseCholesky {
  n: number
  L: SparseMatrix       // lower triangular (CSR), with explicit zeros above diag
  symbolic: SymbolicFactor
}

/**
 * Numeric Cholesky factorization: M = L · Lᵀ where L is lower triangular.
 *
 * Algorithm: left-looking column-wise.
 *   For each column j:
 *     1. Scatter column j of M into a work array
 *     2. For each previously computed column k < j with L[j, k] != 0:
 *          work[r] -= L[j, k] * L[r, k]  for r >= j in column k of L
 *        (Note: this includes the diagonal case r = j, giving work[j] -= L[j, k]²)
 *     3. L[j, j] = sqrt(work[j])
 *     4. L[r, j] = work[r] / L[j, j]  for r > j
 *
 * Reference: Davis (2006) Ch. 4 — "Sparse Cholesky factorization"
 */
export function cholesky(M: SparseMatrix, symbolic: SymbolicFactor): SparseCholesky {
  const n = M.rows

  // Build a lookup for M's entries: mLookup[r] gives Map<col, value> for row r
  const mLookup: Map<number, number>[] = new Array(n).fill(null).map(() => new Map())
  for (let r = 0; r < n; r++) {
    for (let idx = M.rowPtr[r]; idx < M.rowPtr[r + 1]; idx++) {
      mLookup[r].set(M.colIdx[idx], M.values[idx])
    }
  }

  // Store L column-by-column for easy access
  // lColumns[j] = Map<row, value> for column j of L
  const lColumns: Array<Map<number, number>> = new Array(n).fill(null).map(() => new Map())

  for (let j = 0; j < n; j++) {
    const rows = symbolic.colRows[j] // sorted, includes j and rows > j

    // Step 1: Initialize work with column j of M
    const work = new Map<number, number>()
    for (const r of rows) {
      // M[r, j] for r >= j
      // For symmetric lower-triangle CSR, M[r, j] is stored as entry (r, j) in row r if r >= j
      const v = mLookup[r].get(j) ?? 0
      if (v !== 0) work.set(r, v)
    }

    // Step 2: Subtract contributions from previously computed columns
    // For each k < j such that L[j, k] != 0 (i.e., column k of L has entry at row j):
    //   For each r in column k of L's pattern with r >= j:
    //     work[r] -= L[j, k] * L[r, k]
    //
    // Iterate k from 0 to j-1; check if L[j, k] != 0 via lColumns[k].get(j)
    for (let k = 0; k < j; k++) {
      const ljk = lColumns[k].get(j)
      if (ljk === undefined || ljk === 0) continue

      // For each row r in column k of L's pattern with r >= j, subtract L[j, k] * L[r, k]
      for (const [r, lrk] of lColumns[k]) {
        if (r >= j) {
          work.set(r, (work.get(r) ?? 0) - ljk * lrk)
        }
      }
    }

    // Step 3: Compute diagonal L[j, j]
    const diag = work.get(j) ?? 0
    if (diag <= 0) {
      if (diag > -1e-10) {
        // Numerical zero — matrix is positive semi-definite (rank deficient)
        // Use a tiny positive value to allow continuation
        const ljj = 1e-10
        lColumns[j].set(j, ljj)
        // Off-diagonal still computed (will be small)
        for (const r of rows) {
          if (r === j) continue
          const v = work.get(r) ?? 0
          if (v !== 0) lColumns[j].set(r, v / ljj)
        }
      } else {
        throw new Error(`Matrix is not positive definite at index ${j} (diagonal = ${diag})`)
      }
    } else {
      const ljj = Math.sqrt(diag)
      lColumns[j].set(j, ljj)
      // Step 4: Compute off-diagonal L[r, j] = work[r] / L[j, j]
      for (const r of rows) {
        if (r === j) continue
        const v = work.get(r) ?? 0
        if (v !== 0) lColumns[j].set(r, v / ljj)
      }
    }
  }

  // Convert L from column-major Map to CSR (row-major) format
  const triplets: Array<{ row: number; col: number; value: number }> = []
  for (let j = 0; j < n; j++) {
    for (const [r, v] of lColumns[j]) {
      triplets.push({ row: r, col: j, value: v })
    }
  }
  // Sort by row then col (CSR)
  triplets.sort((a, b) => (a.row !== b.row ? a.row - b.row : a.col - b.col))

  const rowPtr = new Array(n + 1).fill(0)
  const colIdx: number[] = []
  const values: number[] = []
  let prevRow = -1
  for (const t of triplets) {
    if (t.row !== prevRow) {
      for (let r = prevRow + 1; r <= t.row; r++) rowPtr[r] = colIdx.length
      prevRow = t.row
    }
    colIdx.push(t.col)
    values.push(t.value)
  }
  for (let r = prevRow + 1; r <= n; r++) rowPtr[r] = colIdx.length

  return {
    n,
    L: { rows: n, cols: n, rowPtr, colIdx, values, symmetric: false },
    symbolic,
  }
}

/**
 * Solve L · y = b (forward substitution) given sparse lower-triangular L.
 *
 * L is stored in CSR (row-major). For each row r, we have L[r, c] for c <= r.
 *
 * Complexity: O(nnz(L))
 */
export function sparseForwardSolve(L: SparseMatrix, b: number[]): number[] {
  if (L.rows !== L.cols) throw new Error('Forward solve requires square matrix')
  const n = L.rows
  const y = new Array(n).fill(0)

  for (let r = 0; r < n; r++) {
    let diag = 0
    let sum = 0
    for (let idx = L.rowPtr[r]; idx < L.rowPtr[r + 1]; idx++) {
      const c = L.colIdx[idx]
      if (c === r) {
        diag = L.values[idx]
      } else if (c < r) {
        sum += L.values[idx] * y[c]
      }
    }
    if (Math.abs(diag) < 1e-15) {
      throw new Error(`Zero pivot at row ${r}`)
    }
    y[r] = (b[r] - sum) / diag
  }

  return y
}

/**
 * Solve Lᵀ · x = y (back substitution) given sparse lower-triangular L.
 *
 * For each row i of Lᵀ (which corresponds to column i of L), we have:
 *   (Lᵀ)[i, j] · x[j] summed over j ≥ i = y[i]
 * Since Lᵀ[i, j] = L[j, i], this becomes:
 *   Σ_{j≥i} L[j, i] · x[j] = y[i]
 *
 * Solving for x[i] (with x[j] for j > i already known):
 *   x[i] = (y[i] - Σ_{j>i} L[j, i] · x[j]) / L[i, i]
 *
 * We process i from n-1 down to 0, using column-major access to L
 * (colEntries[i] gives all L[j, i] for j ≥ i).
 *
 * Complexity: O(nnz(L))
 */
export function sparseBackwardSolve(L: SparseMatrix, y: number[]): number[] {
  const n = L.rows
  const x = new Array(n)

  // Build column-major: for each column c, list of (row, value) with row >= c
  const colEntries: Array<Array<{ row: number; val: number }>> = new Array(n).fill(null).map(() => [])
  for (let r = 0; r < n; r++) {
    for (let idx = L.rowPtr[r]; idx < L.rowPtr[r + 1]; idx++) {
      const c = L.colIdx[idx]
      if (c <= r) {
        colEntries[c].push({ row: r, val: L.values[idx] })
      }
    }
  }

  // Process rows of Lᵀ (= columns of L) from last to first
  for (let i = n - 1; i >= 0; i--) {
    let diag = 0
    let sum = 0
    for (const e of colEntries[i]) {
      if (e.row === i) {
        diag = e.val
      } else if (e.row > i) {
        // L[j, i] · x[j] where j > i (already solved)
        sum += e.val * x[e.row]
      }
    }
    if (Math.abs(diag) < 1e-15) {
      throw new Error(`Zero pivot at row ${i}`)
    }
    x[i] = (y[i] - sum) / diag
  }

  return x
}

/**
 * Solve M · x = b for symmetric positive definite M via sparse Cholesky.
 */
export function sparseCholeskySolve(M: SparseMatrix, b: number[]): number[] {
  if (!M.symmetric) {
    throw new Error('sparseCholeskySolve requires symmetric matrix')
  }
  if (M.rows !== b.length) {
    throw new Error('Dimension mismatch between matrix and right-hand side')
  }

  const symbolic = symbolicFactorize(M)
  const { L } = cholesky(M, symbolic)
  const y = sparseForwardSolve(L, b)
  const x = sparseBackwardSolve(L, y)
  return x
}

/**
 * Solve M · x = b for SPD M, with prior AMD ordering to reduce fill-in.
 *
 * This is the recommended entry point for large networks.
 */
export function sparseCholeskySolveOrdered(
  M: SparseMatrix,
  b: number[],
): { x: number[]; permutation: number[] } {
  if (!M.symmetric) throw new Error('Requires symmetric matrix')

  const P = approximateMinimumDegree(M)
  const Mp = permuteSymmetric(M, P)
  const bp = P.map((i) => b[i])

  const symbolic = symbolicFactorize(Mp)
  const { L } = cholesky(Mp, symbolic)
  const yp = sparseForwardSolve(L, bp)
  const xp = sparseBackwardSolve(L, yp)

  // Invert permutation
  const x = new Array(M.rows)
  for (let i = 0; i < M.rows; i++) x[P[i]] = xp[i]

  return { x, permutation: P }
}

// ---------------------------------------------------------------------------
// Diagonal extraction & selective inversion (Takahashi)
// ---------------------------------------------------------------------------

/**
 * Extract the diagonal of a sparse matrix.
 */
export function diagonal(M: SparseMatrix): number[] {
  const n = Math.min(M.rows, M.cols)
  const diag = new Array(n).fill(0)
  for (let r = 0; r < n; r++) {
    for (let idx = M.rowPtr[r]; idx < M.rowPtr[r + 1]; idx++) {
      if (M.colIdx[idx] === r) {
        diag[r] = M.values[idx]
        break
      }
    }
  }
  return diag
}

/**
 * Selective inversion: compute only the diagonal of M⁻¹ without computing
 * the full inverse. Returns the diagonal entries.
 *
 * Uses Takahashi's method: compute Z = L⁻ᵀ (upper triangular) by back-substitution,
 * starting from the last column. The diagonal of M⁻¹ = Σ_k Z[i, k]² for each i.
 *
 * Equivalently: (M⁻¹)[i, i] = Σ_{k=i..n-1} (L⁻¹[k, i])²
 *
 * Reference: Erisman & Tinney (1975) "On Computing Certain Elements of the
 * Inverse of a Sparse Matrix"
 */
export function sparseInverseDiagonal(
  M: SparseMatrix,
  factor?: SparseCholesky,
): number[] {
  const n = M.rows
  const { L, symbolic } = factor ?? cholesky(M, symbolicFactorize(M))

  // Build column-major access for L: colEntries[c] = list of {row, val} for column c
  const colEntries: Array<Array<{ row: number; val: number }>> = new Array(n).fill(null).map(() => [])
  for (let r = 0; r < n; r++) {
    for (let idx = L.rowPtr[r]; idx < L.rowPtr[r + 1]; idx++) {
      const c = L.colIdx[idx]
      if (c <= r) colEntries[c].push({ row: r, val: L.values[idx] })
    }
  }

  // Z[k, j] = entry (k, j) of L⁻¹ (lower triangular since L is lower)
  // Formula (Takahashi, back-substitution):
  //   Z[j, j] = 1 / L[j, j]
  //   Z[k, j] = -(1/L[k, k]) * Σ_{i=j..k-1} L[k, i] * Z[i, j]   for k > j
  //
  // We compute Z column by column, in DECREASING order of j (from n-1 to 0).
  // For each j, we compute Z[k, j] for all k in pattern[L[:, j]] (k >= j).
  //
  // Then: (M⁻¹)[j, j] = Σ_{k=j..n-1} (Z[k, j])²  (since M⁻¹ = L⁻ᵀ L⁻¹ and L⁻¹ is lower)

  const zCols: Array<Map<number, number>> = new Array(n).fill(null).map(() => new Map())

  for (let j = n - 1; j >= 0; j--) {
    // Z[j, j] = 1 / L[j, j]
    let ljj = 0
    for (const e of colEntries[j]) {
      if (e.row === j) ljj = e.val
    }
    if (Math.abs(ljj) < 1e-15) throw new Error(`Zero diagonal in L at ${j}`)
    zCols[j].set(j, 1 / ljj)

    // For each k > j in the pattern of column j of L:
    const pattern = symbolic.colRows[j].filter((k) => k > j)
    for (const k of pattern) {
      // Z[k, j] = -(1/L[k, k]) * Σ_{i=j..k-1} L[k, i] * Z[i, j]
      let sum = 0
      // Iterate over entries in row k of L (cols i <= k)
      for (let idx = L.rowPtr[k]; idx < L.rowPtr[k + 1]; idx++) {
        const i = L.colIdx[idx]
        if (i >= j && i < k) {
          const zij = zCols[j].get(i)
          if (zij !== undefined) {
            sum += L.values[idx] * zij
          }
        }
      }
      // Find L[k, k]
      let lkk = 0
      for (const e of colEntries[k]) {
        if (e.row === k) lkk = e.val
      }
      if (Math.abs(lkk) < 1e-15) throw new Error(`Zero diagonal in L at ${k}`)
      const zkj = -sum / lkk
      if (zkj !== 0) zCols[j].set(k, zkj)
    }
  }

  // (M⁻¹)[j, j] = Σ_{k=j..n-1} (Z[k, j])²
  const invDiag = new Array(n).fill(0)
  for (let j = 0; j < n; j++) {
    let sum = 0
    for (const v of zCols[j].values()) {
      sum += v * v
    }
    invDiag[j] = sum
  }

  return invDiag
}
