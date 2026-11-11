import { useMemo } from 'react';
import type { AdminData, OverviewRow } from './AdminDashboard';

function includesSearch(values: Array<string | number | null | undefined>, search: string) {
  const query = search.trim().toLocaleLowerCase('he');
  return !query || values.some(value => String(value ?? '').toLocaleLowerCase('he').includes(query));
}
export function useAdminData(data: AdminData, search: string) {
  const overviewRows = useMemo(() => {
    const rows = new Map<string, OverviewRow>();
    for (const invite of data.invites) rows.set(invite.inviteId, { inviteId: invite.inviteId, firstName: invite.firstName, sourceSheet: invite.sourceSheet, sourceRow: invite.sourceRow, maxGuests: invite.maxGuests, opened: false, openCount: 0, firstOpenedAt: '', attendance: null, guestCount: null, fullName: '', message: '', syncStatus: '', link: invite.shortLink, updatedAt: invite.updatedAt });
    for (const visit of data.visits) {
      const current = rows.get(visit.inviteId);
      rows.set(visit.inviteId, { inviteId: visit.inviteId, firstName: current?.firstName || visit.firstName, sourceSheet: current?.sourceSheet || visit.sourceSheet, sourceRow: current?.sourceRow ?? visit.sourceRow, maxGuests: current?.maxGuests ?? null, opened: true, openCount: visit.openCount, firstOpenedAt: visit.firstOpenedAt, attendance: current?.attendance ?? null, guestCount: current?.guestCount ?? null, fullName: current?.fullName || '', message: current?.message || '', syncStatus: visit.syncStatus, link: current?.link || '', updatedAt: visit.lastOpenedAt });
    }
    for (const response of data.responses) {
      const key = response.inviteId || `response:${response.id}`, current = rows.get(key);
      rows.set(key, { inviteId: response.inviteId || 'ללא מזהה', firstName: current?.firstName || response.firstName || response.invitedName || response.fullName, sourceSheet: current?.sourceSheet || response.sourceSheet || '-', sourceRow: current?.sourceRow ?? response.sourceRow, maxGuests: current?.maxGuests ?? response.maxGuests, opened: current?.opened ?? false, openCount: current?.openCount ?? 0, firstOpenedAt: current?.firstOpenedAt || '', attendance: response.attendance, guestCount: response.guestCount, fullName: response.fullName, message: response.message, syncStatus: response.syncStatus, link: current?.link || '', updatedAt: response.updatedAt });
    }
    return [...rows.values()].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  }, [data]);
  return {
    overviewRows,
    filteredOverview: overviewRows.filter(row => includesSearch([row.firstName, row.fullName, row.inviteId, row.sourceSheet, row.sourceRow], search)),
    filteredResponses: data.responses.filter(row => includesSearch([row.firstName, row.fullName, row.inviteId, row.sourceSheet, row.sourceRow, row.message], search)),
    filteredVisits: data.visits.filter(row => includesSearch([row.firstName, row.inviteId, row.sourceSheet, row.sourceRow], search)),
    filteredInvites: data.invites.filter(row => includesSearch([row.firstName, row.inviteId, row.sourceSheet, row.sourceRow], search)),
    filteredLegacy: data.legacyResponses.filter(row => includesSearch([row.fullName, row.phone, row.message], search)),
    stats: { coming: data.responses.filter(row => row.attendance === 'yes').length, guests: data.responses.reduce((sum, row) => sum + (row.attendance === 'yes' ? row.guestCount : 0), 0), declined: data.responses.filter(row => row.attendance === 'no').length, opened: data.visits.length },
  };
}
