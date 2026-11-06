import React,{useEffect,useRef,useState} from 'react';
import {reportBuilderAvailable,readReportJobs,readReportJob,readReportNotes,readReportNavigationJob} from '../utils/reportBuilderData';

const primary={padding:'0.6rem 1rem',border:0,borderRadius:5,background:'#0066cc',color:'#fff',fontWeight:600,cursor:'pointer'};

export default function ReportBuilder({job,onSelectJob}) {
  const [open,setOpen]=useState(false);
  const [error,setError]=useState('');
  const frame=useRef(null);
  const selectJob=useRef(onSelectJob);
  selectJob.current=onSelectJob;
  useEffect(()=>{
    if(!reportBuilderAvailable||!open)return;
    let live=true;
    let navigationVersion=0;
    const receive=async event=>{
      const source=frame.current?.contentWindow;
      if(event.source!==source||event.origin!==window.location.origin||event.data?.type!=='cores-report-request')return;
      const {requestId,resource,jobId}=event.data;
      if(typeof requestId!=='string'||requestId.length>100)return;
      const reply=(payload,message)=>{
        if(live&&source===frame.current?.contentWindow)source.postMessage({type:'cores-report-response',requestId,payload,error:message},window.location.origin);
      };
      try {
        if(resource==='jobs'){reply(await readReportJobs());return;}
        if(typeof jobId!=='string'||!/^[a-f0-9-]{36}$/i.test(jobId))throw new Error('Choose a valid project.');
        if(resource==='open-job'){
          const version=++navigationVersion;
          const next=await readReportNavigationJob(jobId);
          if(!live||version!==navigationVersion)return;
          reply({environment:'dev',navigated:true});
          selectJob.current(next);
          return;
        }
        if(jobId!==job.id)throw new Error('Open that job before reading its report details.');
        if(resource==='job'){reply(await readReportJob(jobId));return;}
        if(resource==='notes'){reply(await readReportNotes(jobId));return;}
        throw new Error('Unsupported report request.');
      }catch(problem){reply(undefined,problem.message||'The dev report data could not be read.');}
    };
    window.addEventListener('message',receive);
    return()=>{live=false;window.removeEventListener('message',receive);};
  },[open,job.id]);
  if(!reportBuilderAvailable)return null;
  const src=`${import.meta.env.BASE_URL}report-builder/index.html?embedded=1&job=${encodeURIComponent(job.id)}`;
  return <section className="no-print" aria-label="Service report builder" style={{margin:'0 0 1.5rem',border:'1px solid #d4e2ec',borderRadius:7,background:'#fff',overflow:'hidden'}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,padding:'1rem 1.1rem',flexWrap:'wrap'}}>
      <div><div style={{display:'flex',alignItems:'center',gap:9}}><strong>Service report</strong><span style={{fontSize:10,color:'#287548',background:'#edf7ef',padding:'3px 6px',borderRadius:3}}>DEV PREVIEW</span></div><p style={{margin:'6px 0 0',color:'#7b8d9b',fontSize:12}}>Opening page, text sections, pictures and PDF attachments. Each job keeps its own draft in this browser.</p></div>
      <button onClick={()=>{setError('');setOpen(value=>!value);}} style={primary}>{open?'Close report builder':'Build service report'}</button>
    </div>
    {error&&<p role="alert" style={{color:'#a33',margin:'0 1rem 1rem'}}>{error}</p>}
    {open&&<iframe key={job.id} ref={frame} src={src} title={`Service report editor for project ${job.job_number}`} style={{display:'block',width:'100%',height:'calc(100vh - 160px)',minHeight:580,maxHeight:1100,scrollMarginTop:76,border:0,borderTop:'1px solid #dce5ec',background:'#edf1f4'}} onError={()=>setError('The report editor could not be opened. Refresh this dev page and try again.')} />}
  </section>;
}
