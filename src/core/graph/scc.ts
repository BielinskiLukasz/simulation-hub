// ─── core/graph/scc.ts — iterative Tarjan strongly-connected components ───

export function stronglyConnectedComponents(n: number, edges: readonly (readonly number[])[]): number[][] {
  const index = new Int32Array(n).fill(-1);
  const low = new Int32Array(n);
  const onStack = new Uint8Array(n);
  const stack: number[] = [];
  const result: number[][] = [];
  let counter = 0;

  for (let root = 0; root < n; root++) {
    if (index[root] !== -1) continue;
    const work: { v: number; child: number }[] = [{ v: root, child: 0 }];
    index[root] = low[root] = counter++;
    stack.push(root);
    onStack[root] = 1;
    while (work.length) {
      const frame = work[work.length - 1]!;
      const v = frame.v;
      const outs = edges[v] ?? [];
      if (frame.child < outs.length) {
        const w = outs[frame.child++]!;
        if (w < 0 || w >= n) continue;
        if (index[w] === -1) {
          index[w] = low[w] = counter++;
          stack.push(w);
          onStack[w] = 1;
          work.push({ v: w, child: 0 });
        } else if (onStack[w]) {
          low[v] = Math.min(low[v]!, index[w]!);
        }
      } else {
        work.pop();
        const parent = work[work.length - 1];
        if (parent) low[parent.v] = Math.min(low[parent.v]!, low[v]!);
        if (low[v] === index[v]) {
          const comp: number[] = [];
          for (;;) {
            const w = stack.pop()!;
            onStack[w] = 0;
            comp.push(w);
            if (w === v) break;
          }
          result.push(comp);
        }
      }
    }
  }
  return result;
}

export function hasCycle(n: number, edges: readonly (readonly number[])[]): boolean {
  return stronglyConnectedComponents(n, edges).some((c) => c.length > 1 || (edges[c[0]!] ?? []).includes(c[0]!));
}
