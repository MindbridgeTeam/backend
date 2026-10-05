from prompts import PROMPT_TEMPLATES, SAFETY_RESPONSE

# 1. SAFETY CHECK - Most important
def is_crisis(message: str) -> bool:
    crisis_words = ["kill myself", "suicide", "want to die", "end my life", "self harm", "cut myself"]
    msg = message.lower()
    for word in crisis_words:
        if word in msg:
            return True
    return False

# 2. INTENT DETECTION - Saturday requirement
def detect_intent(message: str) -> str:
    msg = message.lower()
    
    # Check crisis first
    if is_crisis(msg):
        return "CRISIS"
    
    # Check patterns in order
    if any(w in msg for w in ["goal", "want to start", "i want to", "plan to"]):
        return "GOAL_SETTING"
    
    if any(w in msg for w in ["my plan", "change my plan", "stop plan", "update plan"]):
        return "PLAN_MANAGEMENT"
    
    if any(w in msg for w in ["check in", "checking in", "i did", "completed", "i finished"]):
        return "CHECKIN"
    
    if any(w in msg for w in ["resource", "article", "video", "exercise", "give me", "recommend"]):
        return "RESOURCE_REQUEST"
    
    if any(w in msg for w in ["i feel", "i'm feeling", "anxious", "sad", "stressed", "overwhelmed", "lonely"]):
        return "EMOTIONAL_SUPPORT"
    
    if any(w in msg for w in ["i think", "reflect", "why do i", "meaning"]):
        return "REFLECTION"
    
    return "GENERAL_CHAT"

# 3. RESPONSE GENERATION 
def generate_response(message: str, context: str = "", active_plan: str = "No active plan", library: str = "No resources", checkin: str = "") -> str:
    
    # Safety first
    if is_crisis(message):
        return SAFETY_RESPONSE
    
    intent = detect_intent(message)
    
    template = PROMPT_TEMPLATES.get(intent, PROMPT_TEMPLATES["GENERAL_CHAT"])
    
    # Fill the template
    response = template.format(
        message=message,
        context=context,
        active_plan=active_plan,
        library=library,
        checkin=checkin
    )
    
    return response

# Quick test
if __name__ == "__main__":
    print(detect_intent("I feel anxious about exams"))
    print("---")
    print(generate_response("I feel anxious about exams", context="User is a student"))