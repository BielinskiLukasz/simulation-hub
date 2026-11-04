function h(s,c){const o=[],n=Math.max(0,Math.floor(s)),a=Math.max(1,Math.floor(c));for(let t=0;t<n;t+=a)o.push({start:t,count:Math.min(a,n-t)});return o}export{h as c};
