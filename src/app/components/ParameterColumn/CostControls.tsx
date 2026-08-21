/**
 * src/app/components/ParameterColumn/CostControls.tsx
 *
 * D-18/CRED-05: both cost parameters, editable in place, each seeded from
 * `src/validation/cost-parameters.ts`'s sourced defaults and cited inline through
 * `SourceCitation`. Percent-to-fraction conversion happens exactly once per field, at
 * `src/app/state.ts`'s `DEFAULT_REQUEST` seed (`GENERIC_3X_EXPENSE_RATIO` and
 * `FINANCING_SPREAD_DEFAULT` are FRACTIONS; `BacktestRequest.expenseRatioPercent`/
 * `financingSpreadPercent` are PERCENTAGES, D-09) -- this file reads that seeded percentage back
 * off `DEFAULT_REQUEST` rather than re-declaring its own converted literal.
 * `buildKernelInputs` owns the only other conversion, back to a fraction on the way into the
 * kernel (`src/data/kernel-inputs.ts`) -- a value crosses this percent/fraction boundary exactly
 * twice, never a third time; every other percent figure in this file (the range bounds, the
 * "sourced default was X%" wording) is formatted through `formatPercent`, which does its own
 * internal fraction-to-percent conversion in `src/metrics/format.ts`, not here.
 *
 * CRED-05/D-22 (05-08-PLAN.md Task 3): both fields now carry the shared `DefaultBadge`/
 * `ResetButton` pair, driven by `PARAMETER_DEFAULTS.expenseRatio`/`PARAMETER_DEFAULTS
 * .financingSpread`, replacing this file's own local `isDefault` predicates and default-value
 * constants -- the registry is the one place either default is declared. Clearing either field
 * restores the sourced default through the same registry `reset()` an edit-to-that-value would
 * also produce, and its citation returns; editing either field drops the "default" badge in favor
 * of Reset and restates the citation as user-supplied, naming the sourced default it replaced, so
 * a screenshot always shows what the number was compared against. Both fields render their
 * `COST_PARAMETERS` confidence tag as visible text (CITED for the expense ratio, ASSUMED for both
 * financing-spread bounds), per PITFALLS G3.
 *
 * T-05-22: `ResetButton` writes each committed value directly through the registry, bypassing
 * this file's own `handleExpenseRatioInput`/`handleFinancingSpreadInput`. The two `createEffect`s
 * below are what actually satisfy the must-have that Reset "clears" an invalid state (UI-SPEC F8
 * error row): each watches its own committed percentage and clears the matching error signal
 * whenever it changes for ANY reason, this file's own writes included, so an external write
 * cannot leave a stale error behind.
 */

import { createEffect, createSignal, on, Show } from 'solid-js'

import { formatPercent } from '../../../metrics/format.ts'
import { COST_PARAMETERS, FINANCING_SPREAD_RANGE } from '../../../validation/cost-parameters.ts'
import { PARAMETER_DEFAULTS } from '../../parameter-defaults.ts'
import { backtestRequest, DEFAULT_REQUEST, updateBacktestRequest } from '../../state.ts'
import { DefaultBadge } from './DefaultBadge.tsx'
import { ResetButton } from './ResetButton.tsx'
import { SourceCitation } from './SourceCitation.tsx'

export interface CostControlsProps {
  disabled: boolean
}

const EXPENSE_RATIO_PARAM = COST_PARAMETERS['generic-3x-expense-ratio']
const FINANCING_LOWER_PARAM = COST_PARAMETERS['financing-spread-lower']
const FINANCING_UPPER_PARAM = COST_PARAMETERS['financing-spread-upper']

function userSuppliedExpenseRatioCitation(): string {
  return (
    `user-supplied - sourced default was ${DEFAULT_REQUEST.expenseRatioPercent.toFixed(2)}% ` +
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
    return `${DEFAULT_REQUEST.financingSpreadPercent.toFixed(2)}% - ${rangeText}`
  }
  return `user-supplied - sourced default was ${DEFAULT_REQUEST.financingSpreadPercent.toFixed(2)}% (${rangeText})`
}

export function CostControls(props: CostControlsProps) {
  const [expenseRatioError, setExpenseRatioError] = createSignal<string | null>(null)
  const [financingSpreadError, setFinancingSpreadError] = createSignal<string | null>(null)

  const expenseRatioPercent = () => backtestRequest().expenseRatioPercent
  const financingSpreadPercent = () => backtestRequest().financingSpreadPercent

  // T-05-22: `defer: true` skips the initial mount run, so each effect only fires on an actual
  // change to its own committed value -- including one written externally by Reset.
  createEffect(on(expenseRatioPercent, () => setExpenseRatioError(null), { defer: true }))
  createEffect(on(financingSpreadPercent, () => setFinancingSpreadError(null), { defer: true }))

  function handleExpenseRatioInput(text: string): void {
    // UI-SPEC E5 empty: clearing restores the sourced default, never an unstated cost -- the same
    // registry write Reset itself performs.
    if (text === '') {
      setExpenseRatioError(null)
      PARAMETER_DEFAULTS.expenseRatio.reset()
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
      PARAMETER_DEFAULTS.financingSpread.reset()
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
          when={PARAMETER_DEFAULTS.expenseRatio.isDefault()}
          fallback={
            <>
              <SourceCitation text={userSuppliedExpenseRatioCitation()} />
              <ResetButton parameterId="expenseRatio" disabled={props.disabled} />
            </>
          }
        >
          <SourceCitation costParameterId="generic-3x-expense-ratio" />
          <DefaultBadge parameterId="expenseRatio" disabled={props.disabled} />
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
        <SourceCitation text={financingSpreadCitation(PARAMETER_DEFAULTS.financingSpread.isDefault())} />
        <Show
          when={PARAMETER_DEFAULTS.financingSpread.isDefault()}
          fallback={<ResetButton parameterId="financingSpread" disabled={props.disabled} />}
        >
          <DefaultBadge parameterId="financingSpread" disabled={props.disabled} />
        </Show>
        <Show when={financingSpreadError() !== null}>
          <span class="cost-error" data-testid="financing-spread-error">
            {financingSpreadError()}
          </span>
        </Show>
      </div>
    </div>
  )
}
