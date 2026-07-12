import Link from 'next/link'
import { ArrowRight, CheckCircle2, Clock3 } from 'lucide-react'

import { AdminShell } from './AdminShell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type FeatureItem = {
  title: string
  description: string
  status?: 'Ready' | 'Scaffolded' | 'Planned'
}

type FeatureSection = {
  title: string
  description: string
  items: FeatureItem[]
}

type Highlight = {
  label: string
  value: string
  note: string
}

type ActionLink = {
  label: string
  href: string
  variant?: 'default' | 'outline'
}

type ModuleFeatureScreenProps = {
  active: string
  eyebrow: string
  title: string
  description: string
  highlights: Highlight[]
  sections: FeatureSection[]
  actions?: ActionLink[]
}

function statusTone(status: FeatureItem['status']) {
  if (status === 'Ready') {
    return 'bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300'
  }

  if (status === 'Scaffolded') {
    return 'bg-sky-500/10 text-sky-700 hover:bg-sky-500/10 dark:text-sky-300'
  }

  return 'bg-amber-500/10 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300'
}

export function ModuleFeatureScreen({
  active,
  highlights,
  sections,
  actions,
}: ModuleFeatureScreenProps) {
  return (
    <AdminShell active={active}>
      <div className="space-y-6">
        {actions?.length ? (
          <div className="flex flex-wrap gap-3">
            {actions.map((action) => (
              <Button key={action.label} asChild variant={action.variant ?? 'default'} className="rounded-xl">
                <Link href={action.href}>
                  {action.label}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            ))}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {highlights.map((highlight) => (
            <Card key={highlight.label} className="border-border/70 shadow-sm">
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">{highlight.label}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight">{highlight.value}</p>
                <p className="mt-2 text-sm text-muted-foreground">{highlight.note}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          {sections.map((section) => (
            <Card key={section.title} className="border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>{section.title}</CardTitle>
                <CardDescription>{section.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {section.items.map((item) => (
                  <div key={item.title} className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold">{item.title}</p>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
                      </div>
                      <Badge variant="outline" className={statusTone(item.status)}>
                        {item.status ?? 'Planned'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-border/70 shadow-sm">
          <CardContent className="flex items-start gap-3 p-5 text-sm text-muted-foreground">
            <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              <CheckCircle2 className="mr-1 inline h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              These screens are wired into the admin shell so the requested modules are visible in the sidebar now, while the deeper workflows can be implemented incrementally.
            </p>
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  )
}
