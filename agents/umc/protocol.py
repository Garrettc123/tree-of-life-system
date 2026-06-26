"""
Utility Manifold Consensus (UMC) — GAR-355 Proof of Concept.

Multiple agents each hold a MAUT weight vector representing their utility
perspective on a shared set of dimensions. Consensus is reached by iteratively
navigating the shared utility surface:

  1. Each agent scores an option using its current weights.
  2. The group computes the mean weight vector (the manifold center).
  3. Each agent nudges its weights toward the center by NUDGE_FACTOR.
  4. Repeat until all agent scores fall within `tolerance` of the mean score.

The protocol terminates when consensus is reached or max_rounds is exceeded.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

NUDGE_FACTOR = 0.20
DEFAULT_TOLERANCE = 0.02
DEFAULT_MAX_ROUNDS = 20


@dataclass
class Agent:
    agent_id: str
    weights: Dict[str, float]

    def __post_init__(self):
        total = sum(self.weights.values())
        if total <= 0:
            raise ValueError(f"Agent {self.agent_id}: weights must sum to a positive number")
        self.weights = {k: v / total for k, v in self.weights.items()}

    def score(self, option: Dict[str, float]) -> float:
        """Compute weighted utility score for *option*. Clamps each dimension to [0, 1]."""
        return sum(
            self.weights.get(dim, 0.0) * max(0.0, min(1.0, val))
            for dim, val in option.items()
        )

    def nudge_toward(self, target_weights: Dict[str, float], factor: float = NUDGE_FACTOR) -> None:
        """Shift weights *factor* of the way toward *target_weights* (in-place)."""
        for dim in self.weights:
            self.weights[dim] += factor * (target_weights.get(dim, 0.0) - self.weights[dim])
        total = sum(self.weights.values())
        if total > 0:
            self.weights = {k: v / total for k, v in self.weights.items()}


@dataclass
class RoundResult:
    round_number: int
    scores: Dict[str, float]
    mean_score: float
    max_deviation: float
    converged: bool


@dataclass
class ConsensusResult:
    converged: bool
    rounds_taken: int
    final_score: float
    final_scores: Dict[str, float]
    history: List[RoundResult] = field(default_factory=list)


def _mean_weights(agents: List[Agent]) -> Dict[str, float]:
    all_dims = set().union(*(a.weights for a in agents))
    mean: Dict[str, float] = {}
    for dim in all_dims:
        mean[dim] = sum(a.weights.get(dim, 0.0) for a in agents) / len(agents)
    return mean


def run_consensus_round(
    agents: List[Agent],
    option: Dict[str, float],
    round_number: int,
    tolerance: float = DEFAULT_TOLERANCE,
    nudge: bool = True,
) -> RoundResult:
    """Execute one consensus round. Optionally nudge agent weights toward the group mean."""
    scores = {a.agent_id: a.score(option) for a in agents}
    mean_score = sum(scores.values()) / len(scores)
    max_deviation = max(abs(s - mean_score) for s in scores.values())
    converged = max_deviation <= tolerance

    if nudge and not converged:
        center = _mean_weights(agents)
        for agent in agents:
            agent.nudge_toward(center)

    return RoundResult(
        round_number=round_number,
        scores=scores,
        mean_score=mean_score,
        max_deviation=max_deviation,
        converged=converged,
    )


def consensus(
    agents: List[Agent],
    option: Dict[str, float],
    tolerance: float = DEFAULT_TOLERANCE,
    max_rounds: int = DEFAULT_MAX_ROUNDS,
) -> ConsensusResult:
    """Run the UMC protocol until convergence or *max_rounds* is exhausted."""
    if not agents:
        raise ValueError("consensus() requires at least one agent")
    if len(agents) == 1:
        score = agents[0].score(option)
        result = RoundResult(1, {agents[0].agent_id: score}, score, 0.0, True)
        return ConsensusResult(True, 1, score, {agents[0].agent_id: score}, [result])

    history: List[RoundResult] = []
    for rnd in range(1, max_rounds + 1):
        is_last = rnd == max_rounds
        result = run_consensus_round(agents, option, rnd, tolerance, nudge=not is_last)
        history.append(result)
        if result.converged:
            return ConsensusResult(
                converged=True,
                rounds_taken=rnd,
                final_score=result.mean_score,
                final_scores=result.scores,
                history=history,
            )

    last = history[-1]
    return ConsensusResult(
        converged=False,
        rounds_taken=max_rounds,
        final_score=last.mean_score,
        final_scores=last.scores,
        history=history,
    )
