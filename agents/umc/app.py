from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Dict, List, Optional
from protocol import Agent, consensus, ConsensusResult

app = FastAPI(title="Garcar UMC — Utility Manifold Consensus", version="0.1.0")


class AgentSpec(BaseModel):
    agent_id: str
    weights: Dict[str, float]


class ConsensusRequest(BaseModel):
    agents: List[AgentSpec]
    option: Dict[str, float]
    tolerance: Optional[float] = 0.02
    max_rounds: Optional[int] = 20


class ConsensusResponse(BaseModel):
    converged: bool
    rounds_taken: int
    final_score: float
    final_scores: Dict[str, float]
    history: List[dict]


@app.post("/consensus", response_model=ConsensusResponse)
def run_consensus(req: ConsensusRequest):
    if not req.agents:
        raise HTTPException(status_code=422, detail="At least one agent is required")
    try:
        agents = [Agent(agent_id=a.agent_id, weights=dict(a.weights)) for a in req.agents]
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    result: ConsensusResult = consensus(
        agents=agents,
        option=req.option,
        tolerance=req.tolerance,
        max_rounds=req.max_rounds,
    )
    return ConsensusResponse(
        converged=result.converged,
        rounds_taken=result.rounds_taken,
        final_score=result.final_score,
        final_scores=result.final_scores,
        history=[
            {
                "round": r.round_number,
                "scores": r.scores,
                "mean_score": round(r.mean_score, 4),
                "max_deviation": round(r.max_deviation, 4),
                "converged": r.converged,
            }
            for r in result.history
        ],
    )


@app.get("/health")
def health():
    return {"status": "ok", "service": "umc"}
