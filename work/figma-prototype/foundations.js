// Adapted from figma-generate-library createVariableCollection/createSemanticTokens.
const made=[];
const collections=await figma.variables.getLocalVariableCollectionsAsync();
function collection(name){let c=collections.find(x=>x.name===name);if(!c){c=figma.variables.createVariableCollection(name);c.renameMode(c.defaultModeId,'Default');}return c;}
const prim=collection('茶序 · Primitives'),sem=collection('茶序 · Semantic'),layout=collection('茶序 · Layout');
const existing=await figma.variables.getLocalVariablesAsync();
function variable(c,name,type,value,scopes){let v=existing.find(x=>x.name===name&&x.variableCollectionId===c.id);if(!v){v=figma.variables.createVariable(name,c,type);v.setValueForMode(c.defaultModeId,value);v.scopes=scopes;v.setVariableCodeSyntax('WEB','var(--'+name.replaceAll('/','-')+')');}made.push(v.id);return v;}
const colors={paper:'#F6F4ED',white:'#FFFFFF',ink:'#243D32',forest:'#254E3E',forestHover:'#173E2F',sage:'#E7EDDF',muted:'#657166',line:'#D8DED3',cinnabar:'#A64C3C',amber:'#8A612B',amberBg:'#F5ECDD',red:'#9F4437',redBg:'#F9ECE8',dark:'#183328',lightGreen:'#BFCBB3',tea:'#C9A267',sand:'#E7DFCF'};
function rgb(h){return {r:parseInt(h.slice(1,3),16)/255,g:parseInt(h.slice(3,5),16)/255,b:parseInt(h.slice(5,7),16)/255,a:1};}
const primitives={};for(const [k,v] of Object.entries(colors))primitives[k]=variable(prim,'primitive/'+k,'COLOR',rgb(v),[]);
const aliases={bg:'paper',surface:'white',ink:'ink',brand:'forest',hover:'forestHover',subtle:'sage',muted:'muted',line:'line',accent:'cinnabar',warning:'amber',warningBg:'amberBg',danger:'red',dangerBg:'redBg',dark:'dark',artSage:'lightGreen',artTea:'tea',artSand:'sand'};
for(const [k,p] of Object.entries(aliases))variable(sem,'color/'+k,'COLOR',{type:'VARIABLE_ALIAS',id:primitives[p].id},['FRAME_FILL','SHAPE_FILL','TEXT_FILL','STROKE_COLOR']);
for(const n of [0,4,8,12,16,20,24,32,40,48,64,80])variable(layout,'space/'+n,'FLOAT',n,['GAP']);
for(const n of [0,4,8,12,16,24,999])variable(layout,'radius/'+n,'FLOAT',n,['CORNER_RADIUS']);
const styles=[];const specs=[['Display','Noto Serif SC','Medium',52,72],['Title','Noto Serif SC','Medium',36,52],['Heading','Noto Sans SC','Medium',24,36],['Subheading','Noto Sans SC','Medium',18,28],['Body','Noto Sans SC','Regular',15,26],['Body Strong','Noto Sans SC','Medium',15,26],['Small','Noto Sans SC','Regular',13,22],['Caption','Noto Sans SC','Regular',11,18],['Number','Inter','Regular',48,60]];
const old=await figma.getLocalTextStylesAsync();
for(const [name,family,style,size,line] of specs){await figma.loadFontAsync({family,style});let t=old.find(s=>s.name==='茶序/'+name);if(!t){t=figma.createTextStyle();t.name='茶序/'+name;t.fontName={family,style};t.fontSize=size;t.lineHeight={unit:'PIXELS',value:line};}styles.push({id:t.id,name:t.name});}
return {collectionIds:[prim.id,sem.id,layout.id],variableIds:made,textStyles:styles,createdNodeIds:[],mutatedNodeIds:[]};
