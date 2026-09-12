import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';

const [sourceDirectory,targetDirectory,sharpModulePath]=process.argv.slice(2);
if(!sourceDirectory||!targetDirectory||!sharpModulePath){
  throw new Error('Usage: node convert-tea-history-images.mjs <source> <target> <sharp-module-path>');
}

const require=createRequire(import.meta.url);
const sharp=require(sharpModulePath);
await mkdir(targetDirectory,{recursive:true});

for(let index=1;index<=8;index+=1){
  const source=path.join(sourceDirectory,`${index}.png`);
  const target=path.join(targetDirectory,`${String(index).padStart(2,'0')}.webp`);
  await sharp(source).webp({quality:84,effort:5,smartSubsample:true}).toFile(target);
  console.log(`${path.basename(source)} -> ${path.basename(target)}`);
}
