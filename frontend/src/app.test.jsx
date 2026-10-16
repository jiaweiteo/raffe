import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Admin, AllocationForm, LiveDisplay, ManualModal } from './main.jsx';
import AuditPage from './AuditPage';
import GuestList from './GuestList';

const guests=[{id:'guest-a',name:'Alex Test',table_no:'1',guest_of:'Bride',remarks:'Friend'},
  {id:'guest-b',name:'Jamie Test',table_no:'2',guest_of:'Groom',remarks:'Family'}];
const payment={id:'PAY-TEST',amount_cents:5000,ticket_entitlement:15,possible_duplicates:[],source:'manual'};
let stream;
class TestEvents { constructor(url){this.url=url;stream=this;} close(){} }

beforeEach(()=>{
  vi.stubGlobal('EventSource',TestEvents);
  vi.stubGlobal('fetch',vi.fn(async url=>({ok:true,json:async()=>url==='/api/session'?{token:'test-token'}:{ok:true}})));
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});

const run=async fn=>fn();
async function pickGuest(user, index, name){
  const input=screen.getAllByRole('combobox')[index];
  await user.type(input,name);
  await user.click(screen.getByRole('option',{name:new RegExp(name)}));
}

describe('guest and physical ticket allocation',()=>{
  it('prefills the first range and requires a guest and verification before submitting',async()=>{
    const user=userEvent.setup();const onConfirmed=vi.fn();const dirtyRef={current:false};
    render(<AllocationForm payment={payment} guests={guests} act={run} busy={false} dirtyRef={dirtyRef} onConfirmed={onConfirmed}/>);
    const button=screen.getByRole('button',{name:'Confirm purchase'});
    expect(button.disabled).toBe(true);
    await pickGuest(user,0,'Alex Test');
    expect(screen.getByLabelText('Guest 1 first ticket').value).toBe('0001');
    expect(screen.getByText('52000001 – 52000015')).toBeTruthy();
    expect(button.disabled).toBe(true);
    await user.click(screen.getByRole('checkbox'));
    expect(button.disabled).toBe(false);
    await user.click(button);
    await waitFor(()=>expect(onConfirmed).toHaveBeenCalledOnce());
    const call=fetch.mock.calls.find(([url])=>url==='/api/payments/PAY-TEST/confirm');
    expect(JSON.parse(call[1].body)).toEqual({verified:true,duplicate_ack:false,allocations:[{guest_id:'guest-a',amount_cents:5000,count:15,first_ticket:52000001}]});
    expect(dirtyRef.current).toBe(false);
  });

  it('blocks a split until both the amount and ticket counts reconcile',async()=>{
    const user=userEvent.setup();
    render(<AllocationForm payment={payment} guests={guests} act={run} busy={false} dirtyRef={{current:false}} onConfirmed={()=>{}}/>);
    await pickGuest(user,0,'Alex Test');
    await user.click(screen.getByRole('button',{name:'Split with another guest'}));
    await pickGuest(user,1,'Jamie Test');
    fireEvent.change(screen.getByLabelText('Guest 1 amount'),{target:{value:'25.00'}});
    fireEvent.change(screen.getByLabelText('Guest 2 amount'),{target:{value:'25.00'}});
    fireEvent.change(screen.getByLabelText('Guest 1 ticket count'),{target:{value:'8'}});
    fireEvent.change(screen.getByLabelText('Guest 2 ticket count'),{target:{value:'6'}});
    fireEvent.change(screen.getByLabelText('Guest 1 first ticket'),{target:{value:'0001'}});
    fireEvent.change(screen.getByLabelText('Guest 2 first ticket'),{target:{value:'0009'}});
    await user.click(screen.getByRole('checkbox'));
    const button=screen.getByRole('button',{name:'Confirm purchase'});
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Guest 2 ticket count'),{target:{value:'7'}});
    expect(button.disabled).toBe(false);
    fireEvent.change(screen.getByLabelText('Guest 2 amount'),{target:{value:'24.99'}});
    expect(button.disabled).toBe(true);
  });

  it('requires explicit acknowledgement of a similar alert',async()=>{
    const user=userEvent.setup();
    render(<AllocationForm payment={{...payment,possible_duplicates:['PAY-OTHER']}} guests={guests} act={run} busy={false} dirtyRef={{current:false}} onConfirmed={()=>{}}/>);
    await pickGuest(user,0,'Alex Test');
    fireEvent.change(screen.getByLabelText('Guest 1 first ticket'),{target:{value:'0001'}});
    await user.click(screen.getByLabelText('I verified the transfer, the buyers and the physical ticket ranges.'));
    expect(screen.getByRole('button',{name:'Confirm purchase'}).disabled).toBe(true);
    await user.click(screen.getByLabelText('I checked that this is a separate payment.'));
    expect(screen.getByRole('button',{name:'Confirm purchase'}).disabled).toBe(false);
  });

  it('prefills 0006 after five saved tickets and keeps a manually edited number on refresh',()=>{
    const props={payment,guests,act:run,busy:false,dirtyRef:{current:false},onConfirmed:()=>{}};
    const {rerender}=render(<AllocationForm {...props} occupiedRanges={[{first:52000001,last:52000005}]}/>);
    const input=screen.getByLabelText('Guest 1 first ticket');
    expect(input.value).toBe('0006');
    expect(screen.getByText('52000006 – 52000020')).toBeTruthy();
    fireEvent.change(input,{target:{value:'0100'}});
    rerender(<AllocationForm {...props} occupiedRanges={[{first:52000001,last:52000010}]}/>);
    expect(input.value).toBe('0100');
    expect(screen.getByText('52000100 – 52000114')).toBeTruthy();
  });

  it('updates suggested group ranges when preceding ticket counts change',async()=>{
    const user=userEvent.setup();
    render(<AllocationForm payment={payment} guests={guests} occupiedRanges={[{first:52000001,last:52000005}]} act={run} busy={false} dirtyRef={{current:false}} onConfirmed={()=>{}}/>);
    fireEvent.change(screen.getByLabelText('Guest 1 ticket count'),{target:{value:'5'}});
    await user.click(screen.getByRole('button',{name:'Split with another guest'}));
    expect(screen.getByLabelText('Guest 1 first ticket').value).toBe('0006');
    expect(screen.getByLabelText('Guest 2 first ticket').value).toBe('0011');
    fireEvent.change(screen.getByLabelText('Guest 1 ticket count'),{target:{value:'8'}});
    expect(screen.getByLabelText('Guest 2 first ticket').value).toBe('0014');
  });

  it('skips occupied ranges and leaves the suggestion blank when stock is exhausted',()=>{
    const props={payment,guests,act:run,busy:false,dirtyRef:{current:false},onConfirmed:()=>{}};
    const {rerender}=render(<AllocationForm {...props} occupiedRanges={[{first:52000001,last:52000010},{first:52000011,last:52000015}]}/>);
    expect(screen.getByLabelText('Guest 1 first ticket').value).toBe('0016');
    rerender(<AllocationForm {...props} occupiedRanges={[{first:52000001,last:52001500}]}/>);
    expect(screen.getByLabelText('Guest 1 first ticket').value).toBe('');
    expect(screen.getByRole('button',{name:'Confirm purchase'}).disabled).toBe(true);
  });

  it('uses a complete unused gap if there is insufficient space after the last issued ticket',()=>{
    render(<AllocationForm payment={{...payment,amount_cents:2000,ticket_entitlement:5}} guests={guests} occupiedRanges={[{first:52000006,last:52001500}]} act={run} busy={false} dirtyRef={{current:false}} onConfirmed={()=>{}}/>);
    expect(screen.getByLabelText('Guest 1 first ticket').value).toBe('0001');
    expect(screen.getByText('52000001 – 52000005')).toBeTruthy();
  });
});

it('manual retry reuses its request identifier after an interrupted response',async()=>{
  const user=userEvent.setup();const requests=[];
  fetch.mockImplementation(async(url,options)=>{if(url==='/api/session')return {ok:true,json:async()=>({token:'test-token'})};requests.push(JSON.parse(options.body));throw new Error('offline');});
  const capture=async fn=>{try{await fn();}catch{}};
  render(<ManualModal onClose={()=>{}} onCreated={()=>{}} act={capture} busy={false}/>);
  await user.type(screen.getByRole('textbox',{name:/Payment amount/}),'50');
  await user.click(screen.getByRole('button',{name:'Add to queue'}));
  await user.click(screen.getByRole('button',{name:'Add to queue'}));
  expect(requests).toHaveLength(2);
  expect(requests[0].request_id).toBe(requests[1].request_id);
});

it('the projector only requests public data and retains the last total during an outage',async()=>{
  const summary={pot_cents:80000,prizes_cents:[25000,25000,15000,10000,5000],sold:240,voided:0,remaining:1260,event_title:'A little luck. A lot of love.',updated_at:null};
  fetch.mockResolvedValue({ok:true,json:async()=>summary});
  render(<LiveDisplay/>);
  await waitFor(()=>expect(screen.getByText('800.00')).toBeTruthy());
  expect(screen.getByText('Live from the raffle desk')).toBeTruthy();
  fetch.mockRejectedValue(new Error('offline'));
  await waitFor(()=>expect(screen.getByText('Reconnecting · showing last confirmed total')).toBeTruthy(),{timeout:3000});
  expect(screen.getByText('800.00')).toBeTruthy();
  expect(fetch.mock.calls.every(([url])=>url==='/api/display')).toBe(true);
  expect(screen.queryByText('Alex Test')).toBeNull();
});

function auditFixture() {
  return {revision:1,sheets:[
    {id:'payments',name:'Payment Ledger',columns:[{label:'Payment ID',type:'text'},{label:'Status',type:'status'},{label:'Guest',type:'text'},{label:'Guest amount (SGD)',type:'money'}],rows:[['PAY-TEST','confirmed','Alex Test',5000],['PAY-PENDING','pending',null,2000]]},
    {id:'tickets',name:'Ticket Register',columns:[{label:'Ticket number',type:'number'},{label:'Status',type:'status'},{label:'Payment ID',type:'text'},{label:'Guest ID',type:'text'},{label:'Guest',type:'text'}],rows:Array.from({length:1500},(_,i)=>[52000001+i,i===0?'active':'unissued',i===0?'PAY-TEST':null,i===0?'guest-a':null,i===0?'Alex Test':null])},
    {id:'events',name:'Raffle Audit',columns:[{label:'Sequence',type:'number'},{label:'At (UTC)',type:'datetime_utc'},{label:'Action',type:'action'},{label:'Payment ID',type:'text'},{label:'Details',type:'json'}],rows:[[1,'2026-10-17T10:00:00Z','payment_confirmed','PAY-TEST','{"reason":"Verified transfer"}']]},
  ]};
}

it('opens Audit from navigation and shows all three searchable report tabs with ticket pagination',async()=>{
  const user=userEvent.setup();
  const state={summary:{pot_cents:0,sold:0,remaining:1500,voided:0,prizes_cents:[0,0,0,0,0]},settings:{mail_enabled:false,excel_pending:false},guests,payments:[],mail_issues:[]};
  fetch.mockImplementation(async url=>({ok:true,json:async()=>url==='/api/session'?{token:'test-token'}:url==='/api/audit/sheets'?auditFixture():state}));
  render(<Admin/>);
  await user.click(await screen.findByRole('button',{name:'Audit',exact:true}));
  await screen.findByRole('table',{name:'Payment Ledger'});
  expect(screen.getAllByRole('tab')).toHaveLength(3);
  expect(screen.getByRole('cell',{name:'$50.00'})).toBeTruthy();
  await user.selectOptions(screen.getByLabelText('Filter status'),'pending');
  expect(screen.queryByRole('cell',{name:'Alex Test'})).toBeNull();
  expect(screen.getByRole('cell',{name:'PAY-PENDING'})).toBeTruthy();
  await user.click(screen.getByRole('tab',{name:/Ticket Register/}));
  const table=screen.getByRole('table',{name:'Ticket Register'});
  expect(within(table).getAllByRole('row')).toHaveLength(51);
  await user.click(screen.getByRole('button',{name:'Next audit page'}));
  expect(screen.getByRole('cell',{name:'52000051'})).toBeTruthy();
  await user.type(screen.getByLabelText('Search audit records'),'52001500');
  expect(screen.getByRole('cell',{name:'52001500'})).toBeTruthy();
  expect(within(table).getAllByRole('row')).toHaveLength(2);
  await user.click(screen.getByRole('tab',{name:/Raffle Audit/}));
  expect(screen.getByRole('cell',{name:'payment_confirmed'})).toBeTruthy();
  await user.click(screen.getByText('View details'));
  expect(screen.getByText(/"reason": "Verified transfer"/).closest('details').open).toBe(true);
});

it('recovers an Audit loading error without changing its underlying records',async()=>{
  const user=userEvent.setup();
  const loadReports=vi.fn().mockRejectedValueOnce(new Error('Local app unavailable')).mockResolvedValue(auditFixture());
  render(<AuditPage loadReports={loadReports} onDownload={()=>{}} busy={false} excelPending={false}/>);
  expect(await screen.findByRole('alert')).toBeTruthy();
  await user.click(screen.getByRole('button',{name:'Try again'}));
  expect(await screen.findByRole('table',{name:'Payment Ledger'})).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
});

const listGuests=[
  {id:'alex',name:'Alex',guest_of:'Bride',table_no:'10.0',remarks:'Friend',paid_cents:10000,ticket_count:30},
  {id:'jamie',name:'Jamie',guest_of:'Groom',table_no:'2.0',remarks:'Family',paid_cents:2000,ticket_count:5},
  {id:'zoe',name:'Zoe',guest_of:'Bride',table_no:'1.0',remarks:'Colleague',paid_cents:500,ticket_count:1},
  {id:'tim',name:'Tim',guest_of:'',table_no:'',remarks:'',paid_cents:0,ticket_count:0},
];
const guestRowNames=()=>within(screen.getByRole('table',{name:'Guest List'})).getAllByRole('row').slice(1)
  .map(row=>within(row).getAllByRole('cell')[0].querySelector('strong').textContent);

it('shows whole table numbers and sorts every Guest List column in both directions',async()=>{
  const user=userEvent.setup();
  render(<GuestList guests={listGuests}/>);
  expect(guestRowNames()).toEqual(['Alex','Jamie','Tim','Zoe']);
  expect(screen.getByRole('cell',{name:'10',exact:true})).toBeTruthy();
  expect(screen.queryByRole('cell',{name:'10.0',exact:true})).toBeNull();
  await user.click(screen.getByRole('button',{name:'Sort by Guest',exact:true}));
  expect(guestRowNames()).toEqual(['Zoe','Tim','Jamie','Alex']);
  await user.click(screen.getByRole('button',{name:'Sort by Guest',exact:true}));
  expect(guestRowNames()).toEqual(['Alex','Jamie','Tim','Zoe']);
  for (const [label,ascending,descending] of [
    ['Guest of / relationship',['Alex','Zoe','Jamie','Tim'],['Jamie','Alex','Zoe','Tim']],
    ['Table',['Zoe','Jamie','Alex','Tim'],['Alex','Jamie','Zoe','Tim']],
    ['Paid',['Tim','Zoe','Jamie','Alex'],['Alex','Jamie','Zoe','Tim']],
    ['Tickets',['Tim','Zoe','Jamie','Alex'],['Alex','Jamie','Zoe','Tim']],
  ]) {
    const button=screen.getByRole('button',{name:`Sort by ${label}`,exact:true});
    await user.click(button);
    expect(guestRowNames()).toEqual(ascending);
    expect(button.closest('th').getAttribute('aria-sort')).toBe('ascending');
    await user.click(button);
    expect(guestRowNames()).toEqual(descending);
  }
});

it('combines relationship and integer table filters with search and retains them during refresh',async()=>{
  const user=userEvent.setup();
  const {rerender}=render(<GuestList guests={listGuests}/>);
  await user.selectOptions(screen.getByLabelText('Filter guests by relationship'),'value:Bride');
  expect(guestRowNames()).toEqual(['Alex','Zoe']);
  await user.selectOptions(screen.getByLabelText('Filter guests by table'),'value:1');
  expect(guestRowNames()).toEqual(['Zoe']);
  await user.type(screen.getByLabelText('Search guests'),'Colleague');
  expect(guestRowNames()).toEqual(['Zoe']);
  rerender(<GuestList guests={listGuests.map(g=>g.id==='zoe'?{...g,paid_cents:1000,ticket_count:2}:g)}/>);
  expect(guestRowNames()).toEqual(['Zoe']);
  expect(screen.getByRole('cell',{name:'$10.00'})).toBeTruthy();
  await user.clear(screen.getByLabelText('Search guests'));
  await user.selectOptions(screen.getByLabelText('Filter guests by table'),'value:2');
  expect(screen.getByText('No matching guests.')).toBeTruthy();
  await user.click(screen.getAllByRole('button',{name:'Clear filters'})[0]);
  expect(guestRowNames()).toHaveLength(4);
  await user.selectOptions(screen.getByLabelText('Filter guests by table'),'value:');
  expect(guestRowNames()).toEqual(['Tim']);
});
