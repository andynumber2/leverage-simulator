/**
 * src/app/components/ParameterColumn/SourceCitation.tsx
 *
 * D-18: the reusable inline annotation every default-valued control renders beside itself, at the
 * Label type size in `--color-text-muted`, directly beside the control it annotates -- never in a
 * tooltip or a disclosure. Two forms: a hand-written `text` string for a computed default with no
 * `COST_PARAMETERS` entry (the entry date's "earliest available, {symbol} strict tier", or a
 * disabled-control reason), or a `costParameterId` whose `value`/`citation`/`confidence` are read
 * straight off `COST_PARAMETERS` (`src/validation/cost-parameters.ts`) so a citation can never
 * drift from the constant it describes -- the form plan 04-05's `CostControls` uses.
 */

import { formatPercent } from '../../../metrics/format.ts'
import { COST_PARAMETERS, type CostParameterId } from '../../../validation/cost-parameters.ts'

export type SourceCitationProps = { text: string; costParameterId?: undefined } | { text?: undefined; costParameterId: CostParameterId }

function citationText(props: SourceCitationProps): string {
  if (props.costParameterId !== undefined) {
    const param = COST_PARAMETERS[props.costParameterId]
    return `${formatPercent(param.value)} - ${param.citation} (${param.confidence})`
  }
  return props.text
}

export function SourceCitation(props: SourceCitationProps) {
  return (
    <span class="source-citation" data-testid="source-citation">
      {citationText(props)}
    </span>
  )
}
