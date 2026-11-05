import { it } from 'vitest';
import { createRng } from './core/rng';
import { gridNetwork, stepNetwork } from './sims/traffic/network';
it('dbg collisions', () => {
  const net = gridNetwork();
  for (let t = 0; t < 600; t++) {
    stepNetwork(net, 0.25, createRng(t));
    if (net.collisions > 0) {
      for (let i=0;i<net.n;i++) for (let j=i+1;j<net.n;j++) {
        if (net.alive[i] && net.alive[j] && net.road[i]===net.road[j] && net.lane[i]===net.lane[j] && Math.abs(net.pos[i]!-net.pos[j]!)<3) {
          console.log('t',t,'i',i,'j',j,'road',net.road[i],'lane',net.lane[i],'pos',net.pos[i],net.pos[j],'vel',net.vel[i],net.vel[j]);
          return;
        }
      }
    }
  }
  console.log('no collisions');
});
