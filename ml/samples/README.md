# ML Samples

Generated: 2025-11-03T00:00:00Z

## Files
- `train_small.json` — 30 realistic student records for quick training smoke tests.

## Schema (per student)
```jsonc
{
  "student_id": 230100001,
  "ssc_gpa": 4.12,
  "hsc_gpa": 4.01,
  "gender": "male|female",
  "birth_year": 2001,
  "department": "CSE|EEE|BBA|LAW|ENG|ECE",
  "semesters": {
    "1": {
      "attendancePercentage": 88,
      "Programming": "A",
      "DataStructures": "A-",
      "Math": "B+",
      "English": "A-",
      "Statistics": "B"
    },
    "2": { "...": "..." }
  }
}