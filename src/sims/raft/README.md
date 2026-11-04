# Raft Consensus

A tick-based (1 step = 1 tick) Raft cluster in the browser: followers,
candidates, one leader per term, AppendEntries log replication with
nextIndex backtracking, and majority commit.

## Protocol as implemented

- **Elections:** each follower/candidate counts down a randomised timeout
  (base × [0.6, 1.4], seeded). On expiry it increments its term, votes for
  itself, and sends RequestVote; a candidate with a majority becomes leader.
  Vote granting uses term + vote-once-per-term + log-length freshness.
- **Replication:** the leader sends AppendEntries (heartbeat interval)
  carrying the follower's missing log suffix (`log[nextIndex..]`) and its
  commit index. Followers overwrite from `prevLen`; failures report their
  log length so the leader backtracks. An entry commits once a majority's
  matchIndex covers it; commit propagates on the next heartbeat.
- **Client writes:** the leader appends an entry every 45 ticks
  (`autoWrite`), so replication and commit are continuously visible.
- **Faults:** messages take `messageDelay` ticks and drop with `dropRate`
  (both seeded). Click a node to crash/revive it; Shift+click forces an
  election timeout.

Safety is tested, not just drawn: **never two leaders in one term**,
convergence of all live logs after writes stop, leader crash → successor
with a higher term, and 30% message-loss runs. This is a teaching model —
log freshness compares lengths only, and there are no snapshots, joint
consensus, or pre-vote.
