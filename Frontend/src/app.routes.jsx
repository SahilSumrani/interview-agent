import { createBrowserRouter } from "react-router";
import Login from "./features/auth/pages/Login";
import Register from "./features/auth/pages/Register";
import Protected from "./features/auth/components/Protected";
import Home from "./features/interview/pages/Home";
import Interview from "./features/interview/pages/Interview";
import VoiceInterview from "./features/voice/pages/VoiceInterview";
import StagePreview from "./features/voice/pages/StagePreview";


export const router = createBrowserRouter([
    {
        path: "/",
        element: <VoiceInterview />
    },
    {
        path: "/stage-preview",
        element: <StagePreview />
    },
    {
        path: "/login",
        element: <Login />
    },
    {
        path: "/register",
        element: <Register />
    },
    {
        path: "/prep",
        element: <Protected><Home /></Protected>
    },
    {
        path: "/interview/:interviewId",
        element: <Protected><Interview /></Protected>
    }
])
