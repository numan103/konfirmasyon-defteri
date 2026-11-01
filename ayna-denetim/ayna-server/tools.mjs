export const TOOLS = {
  record_extraction: {
    "name": "record_extraction",
    "description": "Günlük kaydından çıkarılan yapılandırılmış bilgiyi kaydeder.",
    "input_schema": {
      "type": "object",
      "properties": {
        "importance": { "type": "integer", "minimum": 1, "maximum": 10 },
        "summary": { "type": "string" },
        "good_moment": { "type": ["string", "null"] },
        "people": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "ref": { "type": "string" },
              "name": { "type": "string" },
              "matched_person_id": { "type": ["string", "null"] },
              "relation_guess": { "type": ["string", "null"] },
              "sector_guess": { "type": "string", "enum": ["family", "friends", "work", "other", "unknown"] }
            },
            "required": ["ref", "name", "matched_person_id", "sector_guess"]
          }
        },
        "events": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "person_ref": { "type": ["string", "null"] },
              "event_type": { "type": "string", "enum": ["support_received", "support_given", "request", "lent_money", "borrowed_money", "conflict", "time_together", "praise", "criticism", "promise", "other"] },
              "summary": { "type": "string" },
              "emotion_words": { "type": "array", "items": { "type": "string" } },
              "impact": { "type": "integer", "minimum": -2, "maximum": 2 }
            },
            "required": ["person_ref", "event_type", "summary", "impact"]
          }
        },
        "open_loops_new": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "person_ref": { "type": ["string", "null"] },
              "kind": { "type": "string", "enum": ["i_promised", "promised_to_me", "i_lent", "i_borrowed", "waiting", "other"] },
              "description": { "type": "string" },
              "amount": { "type": ["number", "null"] },
              "due_date": { "type": ["string", "null"] }
            },
            "required": ["person_ref", "kind", "description"]
          }
        },
        "open_loops_closed": { "type": "array", "items": { "type": "string" } },
        "facts_new": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "person_ref": { "type": ["string", "null"] },
              "statement": { "type": "string" },
              "valid_from": { "type": ["string", "null"] }
            },
            "required": ["person_ref", "statement"]
          }
        },
        "facts_ended": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "id": { "type": "string" },
              "valid_to": { "type": ["string", "null"] }
            },
            "required": ["id"]
          }
        },
        "person_links": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "person_a_ref": { "type": "string" },
              "person_b_ref": { "type": "string" },
              "relation": { "type": "string" }
            },
            "required": ["person_a_ref", "person_b_ref", "relation"]
          }
        },
        "rule_checks": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "rule_id": { "type": "string" },
              "result": { "type": "string", "enum": ["kept", "broken"] },
              "note": { "type": ["string", "null"] }
            },
            "required": ["rule_id", "result"]
          }
        }
      },
      "required": ["importance", "summary", "good_moment", "people", "events", "open_loops_new", "open_loops_closed", "facts_new", "facts_ended", "person_links", "rule_checks"]
    }
  },
  record_reflection: {
    "name": "record_reflection",
    "description": "Kullanıcıya gösterilecek yansımayı kaydeder.",
    "input_schema": {
      "type": "object",
      "properties": {
        "title": { "type": "string" },
        "body": { "type": "string" },
        "evidence_entry_ids": { "type": "array", "items": { "type": "string" } },
        "risk": { "type": "string", "enum": ["none", "low", "crisis"] }
      },
      "required": ["title", "body", "evidence_entry_ids", "risk"]
    }
  },
  coach_reply: {
    "name": "coach_reply",
    "description": "Koçun kullanıcıya yanıtını kaydeder.",
    "input_schema": {
      "type": "object",
      "properties": {
        "message": { "type": "string" },
        "evidence_entry_ids": { "type": "array", "items": { "type": "string" } },
        "risk": { "type": "string", "enum": ["none", "low", "crisis"] },
        "decision_proposal": {
          "type": ["object", "null"],
          "properties": {
            "title": { "type": "string" },
            "reasoning": { "type": "string" },
            "feeling": { "type": "string" },
            "premortem": { "type": "string" },
            "review_in_days": { "type": "integer" }
          }
        }
      },
      "required": ["message", "evidence_entry_ids", "risk"]
    }
  },
  weekly_report: {
    "name": "weekly_report",
    "description": "Haftalık raporu kaydeder.",
    "input_schema": {
      "type": "object",
      "properties": {
        "title": { "type": "string" },
        "body_markdown": { "type": "string" },
        "focus": { "type": "string" },
        "evidence_entry_ids": { "type": "array", "items": { "type": "string" } },
        "belief_proposals": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "statement": { "type": "string" },
              "evidence_entry_ids": { "type": "array", "items": { "type": "string" } }
            },
            "required": ["statement", "evidence_entry_ids"]
          }
        }
      },
      "required": ["title", "body_markdown", "focus", "evidence_entry_ids", "belief_proposals"]
    }
  },
  monthly_report: {
    "name": "monthly_report",
    "description": "Aylık gelişim değerlendirmesini kaydeder.",
    "input_schema": {
      "type": "object",
      "properties": {
        "title": { "type": "string" },
        "body_markdown": { "type": "string" },
        "focus": { "type": "string" },
        "evidence_entry_ids": { "type": "array", "items": { "type": "string" } }
      },
      "required": ["title", "body_markdown", "focus", "evidence_entry_ids"]
    }
  },
  onboarding_summary: {
    "name": "onboarding_summary",
    "description": "Tanışma görüşmesinden çıkarılan önerileri kaydeder.",
    "input_schema": {
      "type": "object",
      "properties": {
        "display_name": { "type": ["string", "null"] },
        "people": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "name": { "type": "string" },
              "relation": { "type": ["string", "null"] },
              "sector": { "type": "string", "enum": ["family", "friends", "work", "other"] },
              "ring": { "type": "integer", "minimum": 1, "maximum": 3 },
              "traits": { "type": "array", "items": { "type": "string" } }
            },
            "required": ["name", "sector", "ring"]
          }
        },
        "values": { "type": "array", "items": { "type": "string" } },
        "goals": { "type": "array", "items": { "type": "string" } },
        "rules": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "domain": { "type": "string", "enum": ["trade", "relationships", "spending", "general"] },
              "if_text": { "type": "string" },
              "then_text": { "type": "string" }
            },
            "required": ["domain", "if_text", "then_text"]
          }
        }
      },
      "required": ["display_name", "people", "values", "goals", "rules"]
    }
  }
};
