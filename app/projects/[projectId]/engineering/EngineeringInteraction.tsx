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

export default function EngineeringInteraction({projectId}:{projectId:string}){
  const [sessionId]=useState(createSessionId);
  const [messages,setMessages]=useState<Message[]>([
    {
      role:"assistant",
      text:"Tell me the engineering task in your own words. I will ask only for material inputs that are still needed."
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

    setDraft("");
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
      if(!response.ok){
        throw new Error(typeof body.error==="string"?body.error:"Engineering request failed.");
      }

      const result=body as AssistantResponse;
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
    }catch(caught){
      const message=caught instanceof Error?caught.message:"Engineering request failed.";
      setError(message);
      setMessages(current=>[
        ...current,
        {role:"assistant",text:"The request could not be completed. No engineering decision was accepted."}
      ]);
    }finally{
      setBusy(false);
    }
  }

  return <section className="interaction">
    <div className="interactionHeader">
      <div>
        <p className="eyebrow">ENGINEERING INTERACTION</p>
        <h2>Work with the engineering core</h2>
      </div>
      <span className="pill">{lastDecision?.status??"READY"}</span>
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
      <div className="evidenceLine"><span>Evidence</span><strong>{lastDecision.evidenceIds.length} record{lastDecision.evidenceIds.length===1?"":"s"}</strong></div>
    </div>}

    {error&&<div className="notice" role="alert">{error}</div>}

    <form className="composer" onSubmit={submit}>
      <textarea
        value={draft}
        onChange={event=>setDraft(event.target.value)}
        placeholder="Example: Design a shaft that transmits 5 kW at 1500 rpm…"
        rows={4}
        disabled={busy}
        aria-label="Engineering request"
      />
      <div className="composerFooter">
        <span className="muted">Session continuity is preserved for this project interaction.</span>
        <button className="button" type="submit" disabled={busy||!draft.trim()}>{busy?"Working…":"Send request"}</button>
      </div>
    </form>
  </section>;
}

function Metric({label,value}:{label:string;value:string}){
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}
