import { it } from 'vitest';
import { createGrid } from './core/grid/grid';
import { createRng } from './core/rng';
import { runPathfinding, defaultParams } from './sims/pathfinding/model';
it('dbg', () => {
  const rng = createRng(1); const w=10,h=10; const g=createGrid(w,h);
  for (let i=0;i<g.cells.length;i++) if (rng.next()<0.22) g.cells[i]=1;
  g.cells[0]=0; g.cells[99]=0;
  const input={grid:g,start:0,goal:99};
  for (const algorithm of ['dijkstra','astar','jps'] as const) {
    const r = runPathfinding(input,{...defaultParams, algorithm, diagonal:true, corner:'never', weighted:false});
    console.log(algorithm, r.summary.cost, r.summary.found, Array.from(r.data.path).join(','));
  }
  let map='';
  for(let y=0;y<h;y++){for(let x=0;x<w;x++){const i=y*w+x;map+=i===0?'S':i===99?'G':g.cells[i]===1?'#':'.';}map+='\n';}
  console.log(map);
});
