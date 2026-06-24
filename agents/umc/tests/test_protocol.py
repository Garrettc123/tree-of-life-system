import sys
import os
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from protocol import Agent, consensus, run_consensus_round, _mean_weights


OPTION = {"company": 1.0, "industry": 0.8, "employees": 0.6, "message": 0.4, "source": 0.5}


def make_agent(agent_id, **weights):
    return Agent(agent_id=agent_id, weights=weights)


def test_single_agent_reaches_consensus_in_one_round():
    agent = make_agent("a1", company=0.3, industry=0.25, employees=0.2, message=0.15, source=0.1)
    result = consensus([agent], OPTION)
    assert result.converged
    assert result.rounds_taken == 1
    assert 0.0 <= result.final_score <= 1.0


def test_identical_agents_converge_in_one_round():
    weights = dict(company=0.3, industry=0.25, employees=0.2, message=0.15, source=0.1)
    agents = [Agent(f"a{i}", weights=dict(weights)) for i in range(3)]
    result = consensus(agents, OPTION)
    assert result.converged
    assert result.rounds_taken == 1


def test_divergent_agents_converge_within_max_rounds():
    a1 = make_agent("a1", company=1.0, industry=0.0, employees=0.0, message=0.0, source=0.0)
    a2 = make_agent("a2", company=0.0, industry=0.0, employees=0.0, message=0.0, source=1.0)
    a3 = make_agent("a3", company=0.0, industry=1.0, employees=0.0, message=0.0, source=0.0)
    result = consensus([a1, a2, a3], OPTION, tolerance=0.02, max_rounds=50)
    assert result.converged, f"Did not converge in {result.rounds_taken} rounds"
    assert result.rounds_taken <= 50


def test_all_final_scores_within_tolerance_of_mean():
    a1 = make_agent("a1", company=0.5, industry=0.3, employees=0.2)
    a2 = make_agent("a2", company=0.1, industry=0.7, employees=0.2)
    result = consensus([a1, a2], {"company": 0.8, "industry": 0.6, "employees": 0.5}, tolerance=0.02)
    if result.converged:
        mean = result.final_score
        for score in result.final_scores.values():
            assert abs(score - mean) <= 0.02 + 1e-9


def test_weights_normalized_on_construction():
    agent = Agent("a", weights={"x": 2.0, "y": 2.0, "z": 4.0})
    assert abs(sum(agent.weights.values()) - 1.0) < 1e-9


def test_zero_weights_raises():
    with pytest.raises(ValueError):
        Agent("bad", weights={"x": 0.0, "y": 0.0})


def test_nudge_moves_weights_toward_target():
    agent = Agent("a", weights={"x": 1.0, "y": 0.0})
    original_x = agent.weights["x"]
    agent.nudge_toward({"x": 0.0, "y": 1.0}, factor=0.5)
    assert agent.weights["x"] < original_x
    assert abs(sum(agent.weights.values()) - 1.0) < 1e-9


def test_history_length_matches_rounds_taken():
    a1 = make_agent("a1", company=1.0, source=0.0)
    a2 = make_agent("a2", company=0.0, source=1.0)
    result = consensus([a1, a2], {"company": 0.9, "source": 0.1}, max_rounds=30)
    assert len(result.history) == result.rounds_taken


def test_mean_weights_sums_to_one():
    agents = [
        make_agent("a1", x=0.6, y=0.4),
        make_agent("a2", x=0.3, y=0.7),
    ]
    mean = _mean_weights(agents)
    assert abs(sum(mean.values()) - 1.0) < 1e-9
    assert abs(mean["x"] - 0.45) < 1e-9
