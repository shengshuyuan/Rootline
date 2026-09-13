declare module 'lunar-javascript' {
  export class Lunar {
    static fromYmd(year: number, month: number, day: number): Lunar
    toString(): string
    getMonth(): number
    getDay(): number
    getYear(): number
  }

  export class LunarYear {
    static fromYear(year: number): LunarYear
    getMonths(): LunarMonth[]
  }

  export class LunarMonth {
    getYear(): number
    getMonth(): number
    isLeap(): boolean
    getDayCount(): number
  }
}
