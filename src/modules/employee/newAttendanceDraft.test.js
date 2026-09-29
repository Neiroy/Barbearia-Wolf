import { describe, expect, it } from 'vitest'
import {
  attendanceSubmitError,
  attendanceSummaryNames,
  attendanceTotal,
  buildAttendanceSaveItems,
  estimatedCommission,
  toggleAvulsoSelection,
} from './newAttendanceDraft'

const degrade = { id: 'deg', nome: 'Degradê', valor: 35, valor_editavel: false }
const barba = { id: 'barba', nome: 'Barba Simples', valor: 20, valor_editavel: false }
const luzes = { id: 'luzes', nome: 'Luzes', valor: 60, valor_editavel: true }

const base = {
  clienteNome: 'João',
  valoresPersonalizados: {},
}

describe('serviço avulso no novo atendimento', () => {
  it('mantém somente Degradê como antes', () => {
    const avulso = { selecionado: false, nome: '', valor: '' }
    expect(attendanceTotal([degrade], {}, avulso)).toBe(35)
    expect(attendanceSubmitError({ ...base, selectedServices: [degrade], avulso })).toBe('')
    expect(buildAttendanceSaveItems([degrade], {}, avulso)).toEqual([
      { servico_id: 'deg', valor_servico: 35 },
    ])
    expect(attendanceSummaryNames([degrade], avulso)).toEqual(['Degradê'])
  })

  it('aceita somente serviço avulso de R$ 10,00', () => {
    const avulso = { selecionado: true, nome: 'Pezinho do cabelo', valor: '10,00' }
    expect(attendanceTotal([], {}, avulso)).toBe(10)
    expect(attendanceSubmitError({ ...base, selectedServices: [], avulso })).toBe('')
    expect(buildAttendanceSaveItems([], {}, avulso)).toEqual([
      { servico_id: null, servico_avulso_nome: 'Pezinho do cabelo', valor_servico: 10 },
    ])
    expect(attendanceSummaryNames([], avulso)).toEqual(['Pezinho do cabelo'])
  })

  it('soma Degradê e avulso em R$ 45,00', () => {
    const avulso = { selecionado: true, nome: 'Pezinho do cabelo', valor: '10,00' }
    expect(attendanceTotal([degrade], {}, avulso)).toBe(45)
    expect(attendanceSummaryNames([degrade], avulso)).toEqual(['Degradê', 'Pezinho do cabelo'])
    expect(buildAttendanceSaveItems([degrade], {}, avulso)).toEqual([
      { servico_id: 'deg', valor_servico: 35 },
      { servico_id: null, servico_avulso_nome: 'Pezinho do cabelo', valor_servico: 10 },
    ])
  })

  it('soma catálogo e avulso sem alterar os preços cadastrados', () => {
    const avulso = { selecionado: true, nome: 'Retoque', valor: '10,00' }
    expect(attendanceTotal([degrade, barba], {}, avulso)).toBe(65)
  })

  it('não finaliza avulso sem nome ou só com espaços', () => {
    expect(
      attendanceSubmitError({
        ...base,
        selectedServices: [],
        avulso: { selecionado: true, nome: '', valor: '10,00' },
      }),
    ).toBe('Informe o que foi feito no serviço avulso.')
    expect(
      attendanceSubmitError({
        ...base,
        selectedServices: [],
        avulso: { selecionado: true, nome: '   ', valor: '10,00' },
      }),
    ).toBe('Informe o que foi feito no serviço avulso.')
  })

  it('não finaliza avulso com zero, negativo ou valor inválido', () => {
    for (const valor of ['0,00', '', '-10,00', -5, Number.NaN]) {
      expect(
        attendanceSubmitError({
          ...base,
          selectedServices: [],
          avulso: { selecionado: true, nome: 'Pezinho do cabelo', valor },
        }),
      ).toBe('O valor do serviço avulso deve ser maior que zero.')
    }
  })

  it('limpa nome, valor, total e comissão ao desmarcar o avulso', () => {
    const filled = toggleAvulsoSelection({
      servico_avulso_selecionado: false,
      servico_avulso_nome: '',
      servico_avulso_valor: '',
    })
    const withValues = {
      ...filled,
      servico_avulso_nome: 'Pezinho do cabelo',
      servico_avulso_valor: '10,00',
    }
    const cleared = toggleAvulsoSelection(withValues)
    const avulso = {
      selecionado: cleared.servico_avulso_selecionado,
      nome: cleared.servico_avulso_nome,
      valor: cleared.servico_avulso_valor,
    }
    expect(cleared.servico_avulso_nome).toBe('')
    expect(cleared.servico_avulso_valor).toBe('')
    expect(attendanceTotal([degrade], {}, avulso)).toBe(35)
    expect(attendanceSummaryNames([degrade], avulso)).toEqual(['Degradê'])
    expect(estimatedCommission(attendanceTotal([degrade], {}, avulso), { recebe_comissao: true, percentual_comissao: 40 })).toBe(14)
    expect(buildAttendanceSaveItems([degrade], {}, avulso)).toEqual([
      { servico_id: 'deg', valor_servico: 35 },
    ])
  })

  it('mantém serviço flexível com valor informado', () => {
    const avulso = { selecionado: false, nome: '', valor: '' }
    expect(
      attendanceSubmitError({
        ...base,
        selectedServices: [luzes],
        valoresPersonalizados: {},
        avulso,
      }),
    ).toBe('Preencha o valor final de todos os serviços com valor flexível.')
    expect(attendanceTotal([luzes], { luzes: '80,00' }, avulso)).toBe(80)
    expect(buildAttendanceSaveItems([luzes], { luzes: '80,00' }, avulso)).toEqual([
      { servico_id: 'luzes', valor_servico: 80 },
    ])
  })

  it('aplica a comissão estimada já existente sobre o total, inclusive o avulso', () => {
    const avulso = { selecionado: true, nome: 'Pezinho do cabelo', valor: '10,00' }
    const total = attendanceTotal([], {}, avulso)
    expect(estimatedCommission(total, { recebe_comissao: true, percentual_comissao: 40 })).toBe(4)
    expect(estimatedCommission(total, { recebe_comissao: false, percentual_comissao: 40 })).toBe(0)
    expect(estimatedCommission(attendanceTotal([degrade], {}, avulso), { recebe_comissao: true, percentual_comissao: 40 })).toBe(18)
  })
})
