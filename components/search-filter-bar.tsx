"use client"

import { useState } from "react"
import { Search, SlidersHorizontal, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"

interface FilterOption {
  label: string
  value: string
}

interface FilterField {
  name: string
  label: string
  type: "select" | "date" | "text"
  options?: FilterOption[]
  placeholder?: string
}

interface SearchFilterBarProps {
  onSearch: (query: string) => void
  onFilter: (filters: Record<string, string>) => void
  placeholder?: string
  filterFields?: FilterField[]
}

export function SearchFilterBar({
  onSearch,
  onFilter,
  placeholder = "Search...",
  filterFields = [],
}: SearchFilterBarProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [isFilterOpen, setIsFilterOpen] = useState(false)

  const handleSearch = (value: string) => {
    setSearchQuery(value)
    onSearch(value)
  }

  const handleFilterChange = (name: string, value: string) => {
    const newFilters = { ...filters, [name]: value }
    setFilters(newFilters)
    onFilter(newFilters)
  }

  const clearFilter = (name: string) => {
    const newFilters = { ...filters }
    delete newFilters[name]
    setFilters(newFilters)
    onFilter(newFilters)
  }

  const clearAllFilters = () => {
    setFilters({})
    onFilter({})
  }

  const activeFilterCount = Object.keys(filters).filter((key) => filters[key]).length

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={placeholder}
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {filterFields.length > 0 && (
          <Sheet open={isFilterOpen} onOpenChange={setIsFilterOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" className="gap-2 bg-transparent">
                <SlidersHorizontal className="h-4 w-4" />
                Filters
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Filters</SheetTitle>
                <SheetDescription>Apply filters to narrow down your search</SheetDescription>
              </SheetHeader>

              <div className="space-y-4 mt-6">
                {filterFields.map((field) => (
                  <div key={field.name} className="space-y-2">
                    <Label htmlFor={field.name}>{field.label}</Label>

                    {field.type === "select" && field.options && (
                      <Select
                        value={filters[field.name] || ""}
                        onValueChange={(value) => handleFilterChange(field.name, value)}
                      >
                        <SelectTrigger id={field.name}>
                          <SelectValue placeholder={field.placeholder || "Select..."} />
                        </SelectTrigger>
                        <SelectContent>
                          {field.options.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {field.type === "date" && (
                      <Input
                        id={field.name}
                        type="date"
                        value={filters[field.name] || ""}
                        onChange={(e) => handleFilterChange(field.name, e.target.value)}
                      />
                    )}

                    {field.type === "text" && (
                      <Input
                        id={field.name}
                        type="text"
                        placeholder={field.placeholder}
                        value={filters[field.name] || ""}
                        onChange={(e) => handleFilterChange(field.name, e.target.value)}
                      />
                    )}
                  </div>
                ))}

                {activeFilterCount > 0 && (
                  <Button variant="outline" onClick={clearAllFilters} className="w-full bg-transparent">
                    Clear All Filters
                  </Button>
                )}
              </div>
            </SheetContent>
          </Sheet>
        )}
      </div>

      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(filters).map(([key, value]) => {
            if (!value) return null
            const field = filterFields.find((f) => f.name === key)
            const displayValue = field?.options?.find((o) => o.value === value)?.label || value

            return (
              <Badge key={key} variant="secondary" className="gap-1">
                {field?.label}: {displayValue}
                <button onClick={() => clearFilter(key)} className="ml-1 hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )
          })}
        </div>
      )}
    </div>
  )
}
