import {registerHooks} from 'node:module';
import {existsSync} from 'node:fs';
registerHooks({resolve(specifier,context,nextResolve){
 if(specifier.startsWith('.') && !/\.(?:m?js|ts|json)$/.test(specifier)){
   const base=new URL(specifier,context.parentURL);
   for(const extension of ['.ts','.tsx'])if(existsSync(new URL(base.href+extension)))return nextResolve(specifier+extension,context);
 }
 return nextResolve(specifier,context);
}});
