from langgraph.graph import END, START, StateGraph

from app.rag.agentic.nodes import AgentNodes
from app.rag.agentic.policies import MAX_RETRIES
from app.rag.agentic.state import AgentState


def build_graph(nodes: AgentNodes):
    """Compile once; request state never lives on the shared nodes object."""
    graph = StateGraph(AgentState)
    for name in ("classify", "respond", "retrieve", "rerank", "grade", "rewrite", "generate", "escalate"):
        graph.add_node(name, getattr(nodes, name))
    graph.add_edge(START, "classify")
    graph.add_conditional_edges("classify", lambda s: "retrieve" if s["intent"] == "technical_support" else "respond",
                                {"retrieve": "retrieve", "respond": "respond"})
    graph.add_edge("respond", END)
    graph.add_edge("retrieve", "rerank")
    graph.add_edge("rerank", "grade")
    graph.add_conditional_edges("grade", route_evidence,
                                {"generate": "generate", "rewrite": "rewrite", "escalate": "escalate"})
    graph.add_conditional_edges("rewrite", lambda s: "retrieve" if s["rewrite_available"] else "escalate",
                                {"retrieve": "retrieve", "escalate": "escalate"})
    graph.add_edge("generate", END)
    graph.add_edge("escalate", END)
    return graph.compile()


def route_evidence(state: AgentState) -> str:
    if state["evidence_sufficient"]:
        return "generate"
    return "rewrite" if state["retry_count"] < MAX_RETRIES else "escalate"
