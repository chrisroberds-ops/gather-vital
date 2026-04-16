import { useState, useEffect } from 'react'
import {
  getPersonWithHouseholds,
  linkPersonToHousehold,
  unlinkPersonFromHousehold,
  createHousehold,
  searchHouseholds,
} from './people-service'
import Button from '@/shared/components/Button'
import Badge from '@/shared/components/Badge'
import Spinner from '@/shared/components/Spinner'
import Modal from '@/shared/components/Modal'
import { Input, Select } from '@/shared/components/FormFields'
import type { Household, HouseholdMemberRole } from '@/shared/types'

interface Props {
  personId: string
}

export default function HouseholdManager({ personId }: Props) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getPersonWithHouseholds>>>(null)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [unlinking, setUnlinking] = useState<string | null>(null)

  async function reload() {
    const result = await getPersonWithHouseholds(personId)
    setData(result)
    setLoading(false)
  }

  useEffect(() => { void reload() }, [personId])

  async function handleUnlink(householdId: string) {
    setUnlinking(householdId)
    try {
      await unlinkPersonFromHousehold(personId, householdId)
      await reload()
    } finally {
      setUnlinking(null)
    }
  }

  if (loading) return <Spinner size="sm" />

  return (
    <div className="space-y-2">
      {data?.households.map(({ household, memberRecord }) => (
        <div key={household.id} className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg text-sm">
          <div className="flex-1">
            <div className="font-medium text-gray-900">{household.name}</div>
            {household.address_line_1 && (
              <div className="text-gray-400 text-xs">{household.address_line_1}</div>
            )}
          </div>
          <Badge variant={memberRecord.role === 'adult' ? 'info' : 'purple'}>{memberRecord.role}</Badge>
          <Button
            variant="danger"
            size="sm"
            loading={unlinking === household.id}
            onClick={() => void handleUnlink(household.id)}
          >
            Remove
          </Button>
        </div>
      ))}

      {data?.households.length === 0 && (
        <p className="text-sm text-gray-400">Not linked to any household.</p>
      )}

      <Button variant="secondary" size="sm" onClick={() => setShowAdd(true)}>
        + Link to household
      </Button>

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Link to Household">
        <AddHouseholdForm
          personId={personId}
          onDone={() => { setShowAdd(false); void reload() }}
        />
      </Modal>
    </div>
  )
}

function AddHouseholdForm({ personId, onDone }: { personId: string; onDone: () => void }) {
  const [mode, setMode] = useState<'search' | 'new'>('search')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Household[]>([])
  const [role, setRole] = useState<HouseholdMemberRole>('adult')
  const [searching, setSearching] = useState(false)
  const [linking, setLinking] = useState(false)

  // New household form
  const [newName, setNewName] = useState('')
  const [newAddress, setNewAddress] = useState('')
  const [newCity, setNewCity] = useState('')
  const [newState, setNewState] = useState('')
  const [newZip, setNewZip] = useState('')

  async function handleSearch() {
    setSearching(true)
    const res = await searchHouseholds(query)
    setResults(res.slice(0, 10))
    setSearching(false)
  }

  async function handleLink(householdId: string) {
    setLinking(true)
    await linkPersonToHousehold(personId, householdId, role)
    setLinking(false)
    onDone()
  }

  async function handleCreate() {
    setLinking(true)
    const hh = await createHousehold({
      name: newName,
      address_line_1: newAddress || undefined,
      city: newCity || undefined,
      state: newState || undefined,
      zip: newZip || undefined,
    })
    await linkPersonToHousehold(personId, hh.id, role)
    setLinking(false)
    onDone()
  }

  return (
    <div className="space-y-4">
      <div className="flex border border-gray-300 rounded-lg overflow-hidden">
        {(['search', 'new'] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 py-2 text-sm font-medium ${mode === m ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            {m === 'search' ? 'Find existing' : 'Create new'}
          </button>
        ))}
      </div>

      <Select label="Role in household" value={role} onChange={e => setRole(e.target.value as HouseholdMemberRole)}>
        <option value="adult">Adult</option>
        <option value="child">Child</option>
        <option value="other">Other</option>
      </Select>

      {mode === 'search' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              label="Search households"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Name or address…"
              onKeyDown={e => e.key === 'Enter' && void handleSearch()}
            />
            <div className="flex items-end">
              <Button variant="secondary" loading={searching} onClick={() => void handleSearch()}>
                Search
              </Button>
            </div>
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {results.map(hh => (
              <div
                key={hh.id}
                className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg"
              >
                <div>
                  <div className="text-sm font-medium">{hh.name}</div>
                  {hh.address_line_1 && <div className="text-xs text-gray-500">{hh.address_line_1}</div>}
                </div>
                <Button size="sm" loading={linking} onClick={() => void handleLink(hh.id)}>
                  Link
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {mode === 'new' && (
        <div className="space-y-3">
          <Input label="Household name" value={newName} onChange={e => setNewName(e.target.value)} required placeholder="e.g., The Johnson Family" />
          <Input label="Address" value={newAddress} onChange={e => setNewAddress(e.target.value)} placeholder="123 Main St" />
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-1">
              <Input label="City" value={newCity} onChange={e => setNewCity(e.target.value)} />
            </div>
            <div>
              <Input label="State" value={newState} onChange={e => setNewState(e.target.value)} placeholder="TX" maxLength={2} />
            </div>
            <div>
              <Input label="ZIP" value={newZip} onChange={e => setNewZip(e.target.value)} placeholder="75001" />
            </div>
          </div>
          <Button loading={linking} disabled={!newName} onClick={() => void handleCreate()}>
            Create & Link
          </Button>
        </div>
      )}
    </div>
  )
}
