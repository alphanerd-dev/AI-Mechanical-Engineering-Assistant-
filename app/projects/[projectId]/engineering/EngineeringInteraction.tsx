"use client";

import {FormEvent,useMemo,useState} from "react";

type DecisionMetric={key:string;value:number|string;unit?:string};
type Decision={
  status:string;
  validationPassed:boolean;
  metrics:DecisionMetric[];
  evidenceIds:string[];
  nextAction?:string;
  nextQuestion?:string;
};

type AssistantResponse={
  status:string;
  decision:Decision;
  decisionSummary:string;
  nextQuestion?:string;
};

type Message={role:"engineer"|"assistant";text:string;decision?:Decision};

function createSessionId():string{
  if(typeof crypto!=="undefined"&&"randomUUID" in crypto) return crypto.randomUUID();
  return `engineering-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isAssistantResponse(value:unknown):value is AssistantResponse{
  if(!value||typeof value!=="object") return false;
  const candidate=value as Partial<AssistantResponse>;
  const decision=candidate.decision as Partial<Decision>|undefined;
  return typeof candidate.status==="string"
    &&typeof candidate.decisionSummary==="string"
    &&!!decision
    &&typeof decision.status==="string"
    &&typeof decision.validationPassed==="boolean"
    &&Array.isArray(decision.metrics)
    &&Array.isArray(decision.evidenceIds);
}

export default function EngineeringInteraction({projectId}:{projectId:string}){
  const [sessionId]=useState(createSessionId);
  const [messages,setMessages]=useState<Message[]>([
    {
      role:"assistant",
      text:"Describe the engineering task in your own words. I will reuse available session context, ask only for material missing inputs, and show the result, checks, evidence status, and next decision."
    }
  ]);
  const [draft,setDraft]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string>();
  const lastDecision=useMemo(
    ()=>[...messages].reverse().find(message=>message.decision)?.decision,
    [messages]
  );

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const rawIntent=draft.trim();
    if(!rawIntent||busy) return;

    setError(undefined);
    setMessages(current=>[...current,{role:"engineer",text:rawIntent}]);
    setBusy(true);

    try{
      const response=await fetch("/api/engineering/intent",{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({projectId,sessionId,rawIntent})
      });
      const body=await response.json().catch(()=>({}));
      const result=isAssistantResponse(body)?body:undefined;

      // A failed engineering run may still return a structured decision and a useful next action.
      // Render that contract rather than disguising it as a generic HTTP/network error.
      if(!response.ok&&!result){
        throw new Error(typeof body.error==="string"?body.error:"Engineering request failed.");
      }
      if(!result){
        throw new Error("The engineering service returned no usable decision. Your draft is still available.");
      }

      const decision=result.decision;
      const followUp=decision?.nextQuestion
        ?`Required input: ${decision.nextQuestion}.`
        :decision?.nextAction
          ?`Next action: ${decision.nextAction}.`
          :"";
      setMessages(current=>[
        ...current,
        {
          role:"assistant",
          text:[result.decisionSummary,followUp].filter(Boolean).join(" "),
          decision
        }
      ]);
      // Keep a failed request editable. Clear the composer only when the workflow returns
      // a non-failure decision (including NEEDS_INPUT, where the next question is in the chat).
      if(decision.status!=="FAILED") setDraft("");
    }catch(caught){
      const message=caught instanceof Error?caught.message:"Engineering request failed.";
      setError(message);
      setMessages(current=>[
        ...current,
        {role:"assistant",text:"No usable engineering decision was returned. Your draft is still available to edit or retry."}
      ]);
    }finally{
      setBusy(false);
    }
  }

  return <section className="interaction">
    <div className="interactionHeader">
      <div>
        <p className="eyebrow">ENGINEERING INTERACTION</p>
        <h2>From engineering intent to a checked result</h2>
      </div>
      <span className="pill">{busy?"RUNNING":error?"REQUEST FAILED":lastDecision?.status??"READY"}</span>
    </div>

    <div className="conversation" aria-live="polite">
      {messages.map((message,index)=><div className={`message ${message.role}`} key={`${index}-${message.role}`}>
        <span className="messageRole">{message.role==="engineer"?"YOU":"ENGINEERING CORE"}</span>
        <p>{message.text}</p>
      </div>)}
      {busy&&<div className="message assistant"><span className="messageRole">ENGINEERING CORE</span><p>Processing the engineering request…</p></div>}
    </div>

    {lastDecision&&<div className="decisionCard">
      <div className="decisionTop"><span className="tag">DECISION</span><strong>{lastDecision.status}</strong></div>
      <div className="decisionGrid">
        <Metric label="Validation" value={lastDecision.validationPassed?"PASS":"NOT VERIFIED"} />
        {lastDecision.metrics.map(metric=><Metric
          key={metric.key}
          label={metric.key}
          value={typeof metric.value==="number" ? `${metric.value.toFixed(2)}${metric.unit ? ` ${metric.unit}` : ""}` : `${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`}
        />)}
      </div>
      <div className="evidenceLine"><span>Evidence linked</span><strong>{lastDecision.evidenceIds.length} record{lastDecision.evidenceIds.length===1?"":"s"}</strong></div>
      {lastDecision.evidenceIds.length===0&&<p className="muted">No evidence is attached to this result. It is not verified unless and until the required checks and evidence contract are satisfied.</p>}
    </div>}

    {error&&<div className="notice" role="alert">{error}</div>}

    <form className="composer" onSubmit={submit}>
      <textarea
        value={draft}
        onChange={event=>setDraft(event.target.value)}
        placeholder="Describe the engineering outcome you need, with known values and units. Example: calculate shaft torque for 5 kW at 1500 rpm…"
        rows={4}
        disabled={busy}
        aria-label="Engineering request"
      />
      <div className="composerFooter">
        <span className="muted">Known session context is reused where available; missing inputs are requested rather than guessed. A failed request keeps your draft available.</span>
        <button className="button" type="submit" disabled={busy||!draft.trim()}>{busy?"Working…":"Run engineering task"}</button>
      </div>
    </form>
  </section>;
}

function Metric({label,value}:{label:string;value:string}){
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}
