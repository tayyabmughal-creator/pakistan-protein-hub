from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status
import logging

logger = logging.getLogger(__name__)

def custom_exception_handler(exc, context):
    # Call REST framework's default exception handler first,
    # to get the standard error response.
    response = exception_handler(exc, context)

    # Now add the HTTP status code to the response.
    if response is not None:
        response.data['status_code'] = response.status_code
        response.data['error_type'] = exc.__class__.__name__
        logger.warning(f"Handled exception: {exc.__class__.__name__} - {str(exc)} in {context['view'].__class__.__name__}")
    else:
        # Catch unexpected errors (e.g. 500)
        logger.error(f"Unhandled exception: {exc}", exc_info=True)
        return Response({
            'status_code': 500,
            'error_type': 'ServerError',
            'detail': 'Internal Server Error. Please contact support.'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    return response
