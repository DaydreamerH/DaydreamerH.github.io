add_executable(16_stencil_testing main.cpp ${GLAD_SOURCE})

if(WIN32)
    target_link_libraries(16_stencil_testing glfw opengl32)
endif()

foreach(FILE_NAME stencil.vs stencil.fs)
    add_custom_command(TARGET 16_stencil_testing POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_CURRENT_SOURCE_DIR}/${FILE_NAME}"
        "$<TARGET_FILE_DIR:16_stencil_testing>/${FILE_NAME}"
    )
endforeach()
