# Epidemic on Networks

Exact event-driven SIR/SEIR on CSR graphs (Erdős–Rényi, Watts–Strogatz,
Barabási–Albert), with vaccination strategies and statistical evidence.

## Model and conventions

- 1 tick = 1/1000 day; exponential delays are rounded and clamped to ≥1 tick.
- Event-driven algorithm (Kiss–Miller–Simon): when a node becomes infectious
  sample its recovery time and, for each susceptible neighbour, a transmission
  time; only schedule transmissions that beat recovery. Exact for the
  Markovian model, O(edges).
- Transmission uses `Math.log`, so determinism is guaranteed **per engine**
  (not bit-identical across JS engines).
- Vaccination is applied at t=0: `random` or `degree` (highest degree first,
  ties by id). The graph is a pure function of params + `graphSeed`, held in
  **shared** and never snapshotted.
- Major outbreak = more than max(20 nodes, 5% of n) ever infected; the batch
  panel reports it separately because fizzles and take-offs are bimodal.

## Theory panel

T = β/(β+γ); residual ⟨k⟩ and ⟨k²⟩; R₀,seed = T⟨k⟩; early R =
T(⟨k²⟩−⟨k⟩)/⟨k⟩; threshold T_c = ⟨k⟩/(⟨k²⟩−⟨k⟩); final-size prediction by
fixed-point iteration on the degree generating functions.

## Tests

Determinism and replay equivalence with infect/vaccinate actions; plain-data
state; invariants after every event (population conservation, valid infectors,
vaccinated nodes never infected); single-edge transmission probability ≈ T;
degree vaccination removes top degrees; final-size prediction sanity.

## Batch

Variants random vs degree on common random numbers; sweep vaccinated %;
attack rate, P(major outbreak) with Wilson intervals, conditional means,
peak infectious and duration. Worker-count independent by construction.
