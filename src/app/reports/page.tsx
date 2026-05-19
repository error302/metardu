'use client';

import { useState } from 'react'
import Link from 'next/link'
import {
  FileCheck, FileText, MapIcon, Award, BookOpen, FileSpreadsheet,
  Download, Eye, Calendar, MapPin, Search, Plus, ArrowRight,
  Clock, AlertCircle, CheckCircle2,
} from 'lucide-react'

const reportTypes = [
  { name: 'RIM Report', icon: FileCheck, href: '/deed-plan', description: 'Record of Interests in Land - mandatory for all land transactions', color: 'text-blue-500 bg-blue-500/10' },
  { name: 'Survey Report', icon: FileText, href: '/tools/survey-report-builder', description: 'Comprehensive survey report with computations and observations', color: 'text-emerald-500 bg-emerald-500/10' },
  { name: 'Deed Plan', icon: MapIcon, href: '/deed-plan', description: 'Legal document showing property boundaries and beacons', color: 'text-orange-500 bg-orange-500/10' },
  { name: 'Beacon Certificate', icon: Award, href: '/tools/beacon-certificate', description: 'Official beacon coordinates and descriptions', color: 'text-purple-500 bg-purple-500/10' },
  { name: 'Field Book', icon: BookOpen, href: '/fieldbook', description: 'Raw field observations and measurements', color: 'text-amber-500 bg-amber-500/10' },
  { name: 'Statutory Workbook', icon: FileSpreadsheet, href: '/tools/statutory-workbook', description: 'Regulatory compliance workbook for submissions', color: 'text-cyan-500 bg-cyan-500/10' },
]

export default function ReportsPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Reports</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Generate and manage survey documents, certificates, and statutory reports
          </p>
        </div>
        <Link
          href="/deed-plan"
          className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--accent)] text-black font-semibold rounded-lg hover:bg-[var(--accent-dim)] transition-colors text-sm"
        >
          <Plus className="w-4 h-4" />
          Generate Report
        </Link>
      </div>

      {/* Report Types Grid */}
      <div>
        <h2 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-3">
          Report Types
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {reportTypes.map((type) => {
            const Icon = type.icon
            return (
              <Link key={type.name} href={type.href}>
                <div className="group p-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] hover:border-[var(--accent)]/30 transition-all cursor-pointer h-full">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${type.color} shrink-0`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-medium text-sm text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">
                        {type.name}
                      </h3>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-2">
                        {type.description}
                      </p>
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link href="/tools/survey-report-builder" className="group block p-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] hover:border-[var(--accent)]/30 transition-all">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[var(--accent)]/10 text-[var(--accent)]">
              <FileText className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-sm text-[var(--text-primary)]">Survey Report Builder</h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">Create professional survey reports with computations</p>
            </div>
            <ArrowRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors" />
          </div>
        </Link>

        <Link href="/tools/beacon-reference" className="group block p-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] hover:border-[var(--accent)]/30 transition-all">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500">
              <Award className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-sm text-[var(--text-primary)]">Beacon Reference System</h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">Kenyan beacon coordinates and descriptions</p>
            </div>
            <ArrowRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors" />
          </div>
        </Link>
      </div>
    </div>
  )
}
