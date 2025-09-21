import { NgModule } from '@angular/core';

import { SymbolPipe } from './symbol.pipe';

@NgModule({
  imports: [SymbolPipe],
  exports: [SymbolPipe]
})
export class GfSymbolModule {}
