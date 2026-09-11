import { createContext, useContext } from 'react';

export type ItemStatus = 'published' | 'draft' | 'pending_review' | 'approved' | 'withdrawn';
export type Role = 'operator' | 'reviewer' | 'lead' | 'admin';
export type TeaItem = { id:string; serverId?:string; teaId:string; serverTeaId?:string; name:string; subtitle:string; category:'绿茶'|'红茶'; origin:string; sku:string; batch:string; year:number; taste:string[]; water:number; seconds:number; grams:number; vessel:string; status:ItemStatus; revision:number; draftStatus?:Exclude<ItemStatus,'published'|'withdrawn'>; draftNote?:string; offer:'valid'|'expired'|'unavailable'; specific:boolean; price:string; description:string };
export type Lead = {id:string; name:string; contact:string; item:string; kind:string; status:'new'|'assigned'|'contacted'|'closed'; date:string; note:string};
export type Audit = {id:string; action:string; object:string; role:string; time:string};
export const roleNames:Record<Role,string>={operator:'数据运营',reviewer:'客户审核人',lead:'线索跟进',admin:'项目管理员'};
export const statusNames:Record<ItemStatus,string>={published:'已发布',draft:'草稿',pending_review:'待审核',approved:'审核通过',withdrawn:'已下架'};
export const seedItems:TeaItem[]=[
{id:'longjing-2026',teaId:'longjing',name:'西湖龙井',subtitle:'一杯清鲜，慢慢认识春天',category:'绿茶',origin:'浙江 · 杭州',sku:'LJ-050',batch:'2026-SPR-A',year:2026,taste:['清鲜','豆香','回甘'],water:85,seconds:30,grams:3,vessel:'玻璃杯',status:'published',revision:2,offer:'valid',specific:true,price:'168',description:'扁平挺秀的叶形，清鲜的香气。先认识这款茶的滋味，再找到适合自己的冲泡节奏。'},
{id:'qimen-2026',teaId:'qimen',name:'祁门红茶',subtitle:'花果香里，留一刻从容',category:'红茶',origin:'安徽 · 祁门',sku:'QM-050',batch:'2026-SPR-A',year:2026,taste:['花果香','醇和','甜润'],water:90,seconds:20,grams:5,vessel:'白瓷盖碗',status:'published',revision:1,offer:'valid',specific:true,price:'128',description:'细细舒展的茶叶，在热水中慢慢释放花果香。用一盏白瓷盖碗，体会每一泡的变化。'},
{id:'longjing-2025',teaId:'longjing',name:'西湖龙井',subtitle:'认识不同批次的细微变化',category:'绿茶',origin:'浙江 · 杭州',sku:'LJ-050',batch:'2025-SPR-B',year:2025,taste:['清香','柔和','甘润'],water:85,seconds:30,grams:3,vessel:'玻璃杯',status:'published',revision:1,offer:'expired',specific:false,price:'',description:'同一个茶名，也会有不同的采制批次。当前批次尚无专属冲泡资料，以下提供茶类通用指引。'},
{id:'qimen-draft',teaId:'qimen',name:'祁门红茶 · 礼盒',subtitle:'新批次资料整理中',category:'红茶',origin:'安徽 · 祁门',sku:'QM-100',batch:'2026-AUT-A',year:2026,taste:['花果香','甜香'],water:90,seconds:20,grams:5,vessel:'白瓷盖碗',status:'pending_review',revision:1,offer:'unavailable',specific:true,price:'',description:'新批次示例记录，审核发布前不向用户展示。'}
];
export const seedLeads:Lead[]=[{id:'CX-260910-001',name:'示例访客 A',contact:'138****0001',item:'西湖龙井 · 2026-SPR-A',kind:'样品申请',status:'new',date:'2026-09-10 10:32',note:'想了解小份量样品。'},{id:'CX-260910-002',name:'示例访客 B',contact:'d***@example.com',item:'祁门红茶 · 2026-SPR-A',kind:'茶品咨询',status:'contacted',date:'2026-09-09 14:20',note:'已介绍参考规格，等待反馈。'}];
export function goto(path:string){location.hash=path.startsWith('/')?path:'/'+path;}
export function url(path:string){return '#'+(path.startsWith('/')?path:'/'+path);}
export type AppModel={items:TeaItem[];setItems:(fn:(x:TeaItem[])=>TeaItem[])=>void;leads:Lead[];setLeads:(fn:(x:Lead[])=>Lead[])=>void;role:Role;setRole:(r:Role)=>void;toast:(s:string)=>void;audit:Audit[];record:(action:string,object:string)=>void;sourceActive:boolean;setSourceActive:(v:boolean)=>void;reset:()=>void;receipt:Lead|null;setReceipt:(v:Lead)=>void};
export const Context=createContext<AppModel>(null!);
export const useApp=()=>useContext(Context);
export const publicItems=(items:TeaItem[],sourceActive:boolean)=>sourceActive?items.filter(t=>t.status==='published'):[];
export function maskContact(s:string){return s.includes('@')?s.slice(0,1)+'***@'+s.split('@')[1]:s.slice(0,3)+'****'+s.slice(-4);}
export function downloadCsv(name:string,rows:string[][]){const safe=(v:string)=>{const x=/^[=+@\-\t\r]/.test(v)?"'"+v:v;return '"'+x.replaceAll('"','""')+'"';};const content='\ufeff'+rows.map(r=>r.map(safe).join(',')).join('\r\n');const u=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
