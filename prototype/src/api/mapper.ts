import type {TeaItem} from '../model';
import type {BrewingPublic,TeaItemPublic} from './types';

export function mapTeaItem(dto:TeaItemPublic,recipe?:BrewingPublic|null):TeaItem{
  return{
    id:dto.legacy_id||dto.id,serverId:dto.id,teaId:dto.tea_id,serverTeaId:dto.tea_id,name:dto.name,
    subtitle:dto.subtitle||'从一片茶叶，到一杯好茶',category:dto.name.includes('祁门')?'红茶':'绿茶',
    origin:'已发布资料',sku:dto.sku,batch:dto.batch_code,year:dto.year,taste:dto.taste||[],
    water:recipe?.temperature_c.min||85,seconds:recipe?.steps.find(step=>step.duration_seconds>0)?.duration_seconds||30,
    grams:recipe?.tea_g.min||3,vessel:recipe?.vessel||'玻璃杯',status:'published',revision:dto.version.revision,
    offer:'valid',specific:!!recipe?.tea_item_id,price:dto.price||'',description:dto.description||'',
  };
}

export function findLegacyItemId(items:TeaItem[],serverId?:string|null):string|undefined{return items.find(item=>item.serverId===serverId)?.id}
