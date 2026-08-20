/**
 * src/app/components/ParameterColumn/CostControls.tsx
 *
 * D-18/CRED-05: both cost parameters, editable in place, each seeded from
 * `src/validation/cost-parameters.ts`'s sourced defaults and cited inline through
 * `SourceCitation`. Percent-to-fraction conversion happens exactly once per field, here, at seed
 * time (`GENERIC_3X_EXPENSE_RATIO` and `FINANCING_SPREAD_DEFAULT` are FRACTIONS;
 * `BacktestRequest.expenseRatioPercent`/`financingSpreadPercent` are PERCENTAGES, D-09).
 * `buildKernelInputs` owns the only other conversion, back to a fraction on the way into the
 * kernel (`src/data/kernel-inputs.ts`) -- a value crosses this percent/fraction boundary exactly
 * twice, never a third time; every other percent figure in this file (the range bounds, the
 * "sourced default was X%" wording) is formatted through `formatPercent`, which does its own
 * internal fraction-to-percent conversion in `src/metrics/format.ts`, not here.
 *
 * Clearing either field restores the sourced default and its citation returns; editing either
 * field drops the "default" label and restates the citation as user-supplied, naming the sourced
 * default it replaced, so a screenshot always shows what the number was compared against. Both
 * fields render their `COST_PARAMETERS` confidence tag as visible text (CITED for the expense
 * ratio, ASSUMED for both financing-spread bounds), per PITFALLS G3.
 */

import { createSignal, Show } from 'solid-js'

import { formatPercent } from '../../../metrics/format.ts'
import {
  COST_PARAMETERS,
  FINANCING_SPREAD_DEFAULT,
  FINANCING_SPREAD_RANGE,
  GENERIC_3X_EXPENSE_RATIO,
} from '../../../validation/cost-parameters.ts'
import { backtestRequest, updateBacktestRequest } from '../../state.ts'
import { SourceCitation } from './SourceCitation.tsx'

export interface CostControlsProps {
  disabled: boolean
}

// D-09/F-02: the two seed-time percent conversions this file performs -- one per field, matching
// this plan's own acceptance grep. Every other percent figure below routes through formatPercent.
const DEFAULT_EXPENSE_RATIO_PERCENT = GENERIC_3X_EXPENSE_RATIO * 100
const DEFAULT_FINANCING_SPREAD_PERCENT = FINANCING_SPREAD_DEFAULT * 100

const EXPENSE_RATIO_PARAM = COST_PARAMETERS['generic-3x-expense-ratio']
const FINANCING_LOWER_PARAM = COST_PARAMETERS['financing-spread-lower']
const FINANCING_UPPER_PARAM = COST_PARAMETERS['financing-spread-upper']

function userSuppliedExpenseRatioCitation(): string {
  return (
    `user-supplied - sourced default was ${DEFAULT_EXPENSE_RATIO_PERCENT.toFixed(2)}% ` +
    `(${EXPENSE_RATIO_PARAM.citation}, ${EXPENSE_RATIO_PARAM.confidence})`
  )
}

/** Always names both bounds of `FINANCING_SPREAD_RANGE` (D-18's "the bounds are the sensitivity
 * story, never a hidden knob"), regardless of whether the field currently holds the default --
 * only the leading clause (default vs. user-supplied) varies. */
function financingSpreadCitation(isDefault: boolean): string {
  const rangeText =
    `midpoint of the researched range [${formatPercent(FINANCING_SPREAD_RANGE.lower)}, ` +
    `${formatPercent(FINANCING_SPREAD_RANGE.upper)}] (lower ${FINANCING_LOWER_PARAM.confidence}, ` +
    `upper ${FINANCING_UPPER_PARAM.confidence})`
  if (isDefault) {
    return `${DEFAULT_FINANCING_SPREAD_PERCENT.toFixed(2)}% - ${rangeText}`
  }
  return `user-supplied - sourced default was ${DEFAULT_FINANCING_SPREAD_PERCENT.toFixed(2)}% (${rangeText})`
}

export function CostControls(props: CostControlsProps) {
  const [expenseRatioError, setExpenseRatioError] = createSignal<string | null>(null)
  const [financingSpreadError, setFinancingSpreadError] = createSignal<string | null>(null)

  const expenseRatioPercent = () => backtestRequest().expenseRatioPercent
  const financingSpreadPercent = () => backtestRequest().financingSpreadPercent

  const expenseRatioIsDefault = () => expenseRatioPercent() === DEFAULT_EXPENSE_RATIO_PERCENT
  const financingSpreadIsDefault = () => financingSpreadPercent() === DEFAULT_FINANCING_SPREAD_PERCENT

  function handleExpenseRatioInput(text: string): void {
    // UI-SPEC E5 empty: clearing restores the sourced default, never an unstated cost.
    if (text === '') {
      setExpenseRatioError(null)
      updateBacktestRequest({ expenseRatioPercent: DEFAULT_EXPENSE_RATIO_PERCENT })
      return
    }
    const value = Number(text)
    if (!Number.isFinite(value) || value < 0) {
      setExpenseRatioError('expense ratio must be zero or greater')
      return
    }
    setExpenseRatioError(null)
    updateBacktestRequest({ expenseRatioPercent: value })
  }

  function handleFinancingSpreadInput(text: string): void {
    if (text === '') {
      setFinancingSpreadError(null)
      updateBacktestRequest({ financingSpreadPercent: DEFAULT_FINANCING_SPREAD_PERCENT })
      return
    }
    const value = Number(text)
    if (!Number.isFinite(value) || value < 0) {
      setFinancingSpreadError('financing spread must be zero or greater')
      return
    }
    setFinancingSpreadError(null)
    updateBacktestRequest({ financingSpreadPercent: value })
  }

  return (
    <div class="parameter-group cost-controls" data-testid="cost-controls">
      <div class="parameter-group expense-ratio-control" data-testid="expense-ratio-control">
        <label class="control-label" for="expense-ratio-input">
          Expense ratio (%)
        </label>
        <input
          id="expense-ratio-input"
          data-testid="expense-ratio-input"
          type="text"
          inputmode="decimal"
          class="cost-input"
          disabled={props.disabled}
          value={expenseRatioPercent().toFixed(2)}
          onInput={(e) => handleExpenseRatioInput(e.currentTarget.value)}
        />
        <Show
          when={expenseRatioIsDefault()}
          fallback={<SourceCitation text={userSuppliedExpenseRatioCitation()} />}
        >
          <SourceCitation costParameterId="generic-3x-expense-ratio" />
        </Show>
        <Show when={expenseRatioError() !== null}>
          <span class="cost-error" data-testid="expense-ratio-error">
            {expenseRatioError()}
          </span>
        </Show>
      </div>

      <div class="parameter-group financing-spread-control" data-testid="financing-spread-control">
        <label class="control-label" for="financing-spread-input">
          Financing spread (%)
        </label>
        <input
          id="financing-spread-input"
          data-testid="financing-spread-input"
          type="text"
          inputmode="decimal"
          class="cost-input"
          disabled={props.disabled}
          value={financingSpreadPercent().toFixed(2)}
          onInput={(e) => handleFinancingSpreadInput(e.currentTarget.value)}
        />
        <SourceCitation text={financingSpreadCitation(financingSpreadIsDefault())} />
        <Show when={financingSpreadError() !== null}>
          <span class="cost-error" data-testid="financing-spread-error">
            {financingSpreadError()}
          </span>
        </Show>
      </div>
    </div>
  )
}
